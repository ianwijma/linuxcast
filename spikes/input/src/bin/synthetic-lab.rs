//! Root-only, explicit disposable-guest manufacturer/recovery harness.
//! No physical input enumeration; never run against a user's desktop.
use linuxcast_input_spike::{
    Result,
    device::{self, Synthetic},
    fail,
    protocol::{self, Operation, Reply, Request},
    safety::Context,
    unix::{self, Boot, Internal},
};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd},
        unix::{
            fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
            net::UnixStream,
            process::CommandExt,
        },
    },
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};

fn check_lab() -> Result<()> {
    if unsafe { libc::getuid() } != 0
        || std::env::args().nth(1).as_deref() != Some("--reviewed-disposable-guest")
    {
        return Err(fail("REVIEWED_DISPOSABLE_GUEST_REQUIRED"));
    }
    let marker = "/run/linuxcast-input-spike-lab";
    let meta = fs::symlink_metadata(marker)?;
    if !meta.is_file()
        || meta.uid() != 0
        || meta.mode() & 0o777 != 0o600
        || fs::read_to_string(marker)? != "S0-03 disposable Debian synthetic devices only\n"
    {
        return Err(fail("LAB_MARKER_DENIED"));
    }
    let os = fs::read_to_string("/etc/os-release")?;
    if !os.lines().any(|l| l == "ID=debian") || !os.lines().any(|l| l == "VERSION_ID=\"13\"") {
        return Err(fail("DEBIAN_GUEST_REQUIRED"));
    }
    // Refuse to manufacture a keyboard in any logged-in graphical session.
    if let Ok(entries) = fs::read_dir("/run/systemd/sessions") {
        for entry in entries {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                let s = fs::read_to_string(entry.path())?;
                if s.lines().any(|l| l == "TYPE=x11" || l == "TYPE=wayland") {
                    return Err(fail("GRAPHICAL_SESSION_PRESENT"));
                }
            }
        }
    }
    unix::no_core()?;
    device::silence();
    if unsafe { libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1) } != 0 {
        return Err(fail("SUBREAPER_FAILED"));
    }
    Ok(())
}
fn device_open(path: &str) -> Result<OwnedFd> {
    if path != "/dev/uinput"
        && !(path.starts_with("/dev/input/event")
            && path[16..].bytes().all(|c| c.is_ascii_digit())
            && path.len() > 16)
    {
        return Err(fail("MANUFACTURED_PATH_INVALID"));
    }
    let file = OpenOptions::new()
        .read(true)
        .write(path == "/dev/uinput")
        .custom_flags(libc::O_CLOEXEC | libc::O_NONBLOCK | libc::O_NOFOLLOW)
        .open(path)?;
    if file.metadata()?.mode() & libc::S_IFMT != libc::S_IFCHR {
        return Err(fail("NOT_CHARACTER_DEVICE"));
    }
    Ok(file.into())
}
fn read_frame<T: serde::de::DeserializeOwned>(stream: &mut UnixStream) -> Result<T> {
    let mut prefix = [0u8; 4];
    stream.read_exact(&mut prefix)?;
    let n = u32::from_be_bytes(prefix) as usize;
    if n == 0 || n > protocol::CONTROL_MAX {
        return Err(fail("FRAME_BOUND"));
    }
    let mut bytes = vec![0u8; n];
    stream.read_exact(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}
struct Client {
    stream: UnixStream,
    pid: i32,
}
impl Client {
    fn new(path: &str, uid: u32) -> Result<Self> {
        Self::connect(path, uid, false)
    }
    fn denied_peer(path: &str, uid: u32) -> Result<Self> {
        Self::connect(path, uid, true)
    }
    fn connect(path: &str, uid: u32, initial_denial: bool) -> Result<Self> {
        let (parent, child) = UnixStream::pair()?;
        parent.set_read_timeout(Some(Duration::from_secs(2)))?;
        parent.set_write_timeout(Some(Duration::from_secs(2)))?;
        let expected = unsafe { libc::getpid() } as u32;
        let pid = unsafe { libc::fork() };
        if pid < 0 {
            return Err(fail("LAB_CLIENT_FORK_FAILED"));
        }
        if pid == 0 {
            let result = (|| -> Result<()> {
                let fd = child.as_raw_fd();
                // Close every inherited device/control duplicate before any
                // client work. In particular no source evdev client survives.
                if unsafe { libc::dup2(fd, 3) } < 0
                    || unsafe { libc::syscall(libc::SYS_close_range, 4u32, u32::MAX, 0u32) } != 0
                {
                    return Err(fail("CLIENT_FD_CLOSE_FAILED"));
                }
                if unsafe { libc::setgroups(0, std::ptr::null()) } != 0
                    || unsafe { libc::setgid(uid) } != 0
                    || unsafe { libc::setuid(uid) } != 0
                {
                    return Err(fail("CLIENT_UID_FAILED"));
                }
                unix::parent_death(expected)?;
                unix::no_core()?;
                let mut channel = unsafe { UnixStream::from_raw_fd(3) };
                let mut remote = UnixStream::connect(path)?;
                remote.set_read_timeout(Some(Duration::from_secs(1)))?;
                remote.set_write_timeout(Some(Duration::from_secs(1)))?;
                if unix::peer(remote.as_raw_fd())?.uid != 0 {
                    return Err(fail("CLIENT_SERVICE_NOT_ROOT"));
                }
                loop {
                    let request: Request = read_frame(&mut channel)?;
                    // A rejected peer receives a bounded denial at accept,
                    // before any request. Read it without a racy write after
                    // the server has already closed that rejected connection.
                    if !initial_denial {
                        remote.write_all(&protocol::frame(&request)?)?;
                    }
                    let reply: Reply = read_frame(&mut remote)?;
                    channel.write_all(&protocol::frame(&reply)?)?;
                }
            })();
            // No unwind/drop: FD3 was deliberately rebound and originals are
            // no longer valid Rust owners in this fork branch.
            unsafe { libc::_exit(if result.is_ok() { 0 } else { 3 }) };
        }
        drop(child);
        Ok(Self {
            stream: parent,
            pid,
        })
    }
    fn request(&mut self, operation: Operation, generation: u64) -> Result<Reply> {
        self.stream.write_all(&protocol::frame(&Request {
            version: 1,
            generation,
            operation,
        })?)?;
        read_frame(&mut self.stream)
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        unsafe {
            libc::kill(self.pid, libc::SIGKILL);
            libc::waitpid(self.pid, std::ptr::null_mut(), 0);
        }
    }
}
struct Case {
    source: Synthetic,
    probe: OwnedFd,
    output: OwnedFd,
    control: OwnedFd,
    supervisor: std::process::Child,
    worker: u32,
    worker_pidfd: OwnedFd,
    client: Option<Client>,
    context: Context,
    path: String,
}
impl Case {
    fn start(index: u32, worker_uid: u32, worker_gid: u32, client_uid: u32) -> Result<Self> {
        linuxcast_input_spike::diagnostics::stage("SOURCE_MANUFACTURE");
        let phys = format!("linuxcast-s0-03/manufactured-{}-{index}", unsafe {
            libc::getpid()
        });
        let source = Synthetic::new(device_open("/dev/uinput")?, &phys)?;
        linuxcast_input_spike::diagnostics::stage("SOURCE_NODE_OPEN");
        let node = source.node()?;
        let input = device_open(&node)?;
        let probe = device_open(&node)?;
        let output_fd = device_open("/dev/uinput")?;
        linuxcast_input_spike::diagnostics::stage("RUNTIME_DIRECTORY");
        let directory = format!("/run/linuxcast-input-spike/{}-{index}", unsafe {
            libc::getpid()
        });
        fs::create_dir(&directory)?;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o711))?;
        let path = format!("{directory}/control.sock");
        let (control, child_control) = unix::pair()?;
        let child_fd = child_control.as_raw_fd();
        let parent = unsafe { libc::getpid() } as u32;
        let mut command = Command::new(
            std::env::current_exe()?.with_file_name("linuxcast-input-spike-supervisor"),
        );
        command
            .arg("--synthetic-lab")
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        unsafe {
            command.pre_exec(move || {
                if libc::dup2(child_fd, 3) < 0 || libc::fcntl(3, libc::F_SETFD, 0) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        linuxcast_input_spike::diagnostics::stage("SUPERVISOR_SPAWN");
        let mut supervisor = command.spawn()?;
        drop(child_control);
        let boot = Boot {
            parent,
            worker_uid,
            worker_gid,
            client_uid,
            source_phys: phys,
            socket_path: path.clone(),
        };
        linuxcast_input_spike::diagnostics::stage("SUPERVISOR_HANDOFF");
        unix::send(
            control.as_raw_fd(),
            &boot,
            &[input.as_raw_fd(), output_fd.as_raw_fd()],
        )?;
        drop(input);
        drop(output_fd);
        linuxcast_input_spike::diagnostics::stage("SUPERVISOR_READY");
        let (ready, _) = match unix::wait_receive::<Internal>(control.as_raw_fd(), 0, 5000) {
            Ok(r) => r,
            Err(e) => {
                let _ = supervisor.kill();
                let _ = supervisor.wait();
                return Err(e);
            }
        };
        let Internal::Ready {
            worker_pid,
            virtual_node,
        } = ready
        else {
            return Err(fail("LAB_WORKER_NOT_READY"));
        };
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, worker_pid, 0u32) };
        if fd < 0 {
            return Err(fail("WORKER_PIDFD_UNAVAILABLE"));
        }
        let worker_pidfd = unsafe { OwnedFd::from_raw_fd(fd as i32) };
        linuxcast_input_spike::diagnostics::stage("VIRTUAL_NODE_OPEN");
        let output = device_open(&virtual_node)?;
        let context = Context {
            uid: client_uid,
            seat: "seat0".into(),
            session_type: "wayland".into(),
            active: true,
            local: true,
            unlocked: Some(true),
            consented: true,
            generation: 1,
            observed_ms: unix::monotonic_ms(),
        };
        unix::send(
            control.as_raw_fd(),
            &Internal::Context {
                context: context.clone(),
            },
            &[],
        )?;
        Ok(Self {
            source,
            probe,
            output,
            control,
            supervisor,
            worker: worker_pid,
            worker_pidfd,
            client: None,
            context,
            path,
        })
    }
    fn signal_worker(&self, signal: i32) -> Result<()> {
        if unsafe {
            libc::syscall(
                libc::SYS_pidfd_send_signal,
                self.worker_pidfd.as_raw_fd(),
                signal,
                std::ptr::null::<libc::siginfo_t>(),
                0u32,
            )
        } != 0
        {
            return Err(fail("WORKER_SIGNAL_FAILED"));
        }
        Ok(())
    }
    fn stop_worker(&self) -> Result<()> {
        self.signal_worker(libc::SIGSTOP)?;
        let deadline = unix::monotonic_ms() + 100;
        loop {
            let status = fs::read_to_string(format!("/proc/{}/status", self.worker))?;
            if status
                .lines()
                .any(|line| line.starts_with("State:\tT") || line.starts_with("State:\tt"))
            {
                return Ok(());
            }
            if unix::monotonic_ms() >= deadline {
                return Err(fail("WORKER_STOP_NOT_OBSERVED"));
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn fresh_worker_heartbeat(&self) -> Result<()> {
        let mut empty = false;
        for _ in 0..32 {
            if unix::receive::<Internal>(self.control.as_raw_fd(), 0)?.is_none() {
                empty = true;
                break;
            }
        }
        if !empty {
            return Err(fail("HEARTBEAT_OBSERVER_BOUND"));
        }
        let (packet, _) = unix::wait_receive::<Internal>(self.control.as_raw_fd(), 0, 300)?;
        if !matches!(packet, Internal::Heartbeat) {
            return Err(fail("NO_FRESH_WORKER_HEARTBEAT"));
        }
        Ok(())
    }
    fn refresh(&mut self) -> Result<()> {
        self.context.observed_ms = unix::monotonic_ms();
        unix::send(
            self.control.as_raw_fd(),
            &Internal::Context {
                context: self.context.clone(),
            },
            &[],
        )
    }
    fn client(&mut self) -> Result<&mut Client> {
        if self.client.is_none() {
            self.client = Some(Client::new(&self.path, self.context.uid)?);
        }
        Ok(self.client.as_mut().expect("client initialized"))
    }
    fn begin_arm(&mut self) -> Result<()> {
        linuxcast_input_spike::diagnostics::stage("CLIENT_HANDSHAKE_ARM");
        let r = self.client()?.request(Operation::Handshake, 1)?;
        if r.reason != "READY" {
            return Err(fail("LAB_HANDSHAKE_DENIED"));
        }
        let r = self.client()?.request(Operation::Arm, 1)?;
        if r.reason != "READY" {
            return Err(fail("LAB_ARM_DENIED"));
        }
        Ok(())
    }
    fn await_arm(&mut self) -> Result<()> {
        linuxcast_input_spike::diagnostics::stage("CLIENT_ARM_ACK");
        let end = unix::monotonic_ms() + 500;
        loop {
            let r = self.client()?.request(Operation::Status, 1)?;
            if r.state == "armed" {
                break;
            }
            if unix::monotonic_ms() >= end {
                return Err(fail("ARM_ACK_TIMEOUT"));
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        if device::regrab(&self.probe) {
            return Err(fail("NO_ACTUAL_GRAB"));
        }
        Ok(())
    }
    fn arm(&mut self) -> Result<()> {
        self.begin_arm()?;
        self.await_arm()
    }
    fn hold_modifiers(&self) -> Result<()> {
        linuxcast_input_spike::diagnostics::stage("SYNTHETIC_PASSTHROUGH");
        self.source.emit(29, 1)?;
        self.source.emit(42, 1)?;
        let end = unix::monotonic_ms() + 300;
        while !device::key_down(&self.output, 29) || !device::key_down(&self.output, 42) {
            if unix::monotonic_ms() >= end {
                return Err(fail("PASSTHROUGH_NOT_OBSERVED"));
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        Ok(())
    }
    fn recovered(&mut self, start: u64, limit: u64, keep_context: bool) -> Result<u64> {
        linuxcast_input_spike::diagnostics::stage("KERNEL_RECOVERY");
        let mut refreshed = start;
        loop {
            if device::regrab(&self.probe) && device::removed(&self.output) {
                return Ok(unix::monotonic_ms() - start);
            }
            if unix::monotonic_ms() - start > limit {
                return Err(fail("KERNEL_RECOVERY_TIMEOUT"));
            }
            if keep_context && unix::monotonic_ms().saturating_sub(refreshed) >= 100 {
                let _ = self.refresh();
                refreshed = unix::monotonic_ms();
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Case {
    fn drop(&mut self) {
        let _ = self.supervisor.kill();
        let _ = self.supervisor.wait();
        unsafe {
            libc::syscall(
                libc::SYS_pidfd_send_signal,
                self.worker_pidfd.as_raw_fd(),
                libc::SIGKILL,
                std::ptr::null::<libc::siginfo_t>(),
                0u32,
            );
            libc::waitpid(self.worker as i32, std::ptr::null_mut(), 0);
        }
        let _ = fs::remove_file(&self.path);
        if let Some(parent) = Path::new(&self.path).parent() {
            let _ = fs::remove_dir(parent);
        }
    }
}
fn run() -> Result<()> {
    linuxcast_input_spike::diagnostics::stage("LAB_GUARD");
    check_lab()?;
    linuxcast_input_spike::diagnostics::stage("DEDICATED_ACCOUNT");
    let passwd = fs::read_to_string("/etc/passwd")?;
    let record = passwd
        .lines()
        .find(|l| l.starts_with("linuxcast-input-spike:"))
        .ok_or_else(|| fail("DEDICATED_NONLOGIN_ACCOUNT_REQUIRED"))?;
    let fields: Vec<_> = record.split(':').collect();
    if fields.len() != 7 || !fields[6].ends_with("/nologin") {
        return Err(fail("NONLOGIN_SHELL_REQUIRED"));
    }
    let uid: u32 = fields[2].parse()?;
    let gid: u32 = fields[3].parse()?;
    if uid == 0 || uid == 1000 {
        return Err(fail("DEDICATED_UID_REQUIRED"));
    }
    fs::create_dir_all("/run/linuxcast-input-spike")?;
    let meta = fs::symlink_metadata("/run/linuxcast-input-spike")?;
    if !meta.is_dir() || meta.uid() != 0 || meta.mode() & 0o022 != 0 {
        return Err(fail("LAB_RUNTIME_UNSAFE"));
    }
    fs::set_permissions(
        "/run/linuxcast-input-spike",
        fs::Permissions::from_mode(0o711),
    )?;
    let mut results = Vec::new();
    for (index, name) in [
        "worker-sigkill",
        "supervisor-sigkill",
        "worker-watchdog",
        "app-lease",
        "emergency",
    ]
    .iter()
    .enumerate()
    {
        let mut case = Case::start(index as u32, uid, gid, 1000)?;
        case.arm()?;
        case.hold_modifiers()?;
        if *name == "worker-watchdog" {
            case.fresh_worker_heartbeat()?;
        }
        // Timing starts before the triggering action; it includes signal or
        // chord delivery and observer polling, not device staging/startup.
        let trigger = unix::monotonic_ms();
        match *name {
            "worker-sigkill" => {
                case.signal_worker(libc::SIGKILL)?;
            }
            "supervisor-sigkill" => {
                case.supervisor.kill()?;
            }
            "worker-watchdog" => {
                case.stop_worker()?;
            }
            "app-lease" => {}
            "emergency" => {
                case.source.emit(97, 1)?;
                case.source.emit(1, 1)?;
            }
            _ => unreachable!(),
        }
        let (deadline, tolerance) = match *name {
            "worker-watchdog" => (500, 75),
            "app-lease" => (1000, 75),
            "emergency" => (100, 75),
            _ => (250, 75),
        };
        let elapsed = case.recovered(trigger, deadline + tolerance, true)?;
        std::thread::sleep(Duration::from_millis(550));
        if !device::regrab(&case.probe) || !device::removed(&case.output) {
            return Err(fail("AUTOMATIC_REARM_DETECTED"));
        }
        results.push(serde_json::json!({"scenario":name,"syntheticModifiersObserved":true,"otherClientRegrabbed":true,"virtualDeviceRemoved":true,"noAutomaticRearm":true,"recoveryMs":elapsed,"mechanismDeadlineMs":deadline,"observerToleranceMs":tolerance}));
    }
    for (index, name) in [
        "locked",
        "unknown-lock",
        "inactive",
        "tty",
        "remote",
        "stale-context",
        "stale-generation",
    ]
    .iter()
    .enumerate()
    {
        let mut case = Case::start(10 + index as u32, uid, gid, 1000)?;
        match *name {
            "locked" => case.context.unlocked = Some(false),
            "unknown-lock" => case.context.unlocked = None,
            "inactive" => case.context.active = false,
            "tty" => case.context.session_type = "tty".into(),
            "remote" => case.context.local = false,
            "stale-context" => case.context.observed_ms = 0,
            "stale-generation" => case.context.generation = 2,
            _ => unreachable!(),
        }
        unix::send(
            case.control.as_raw_fd(),
            &Internal::Context {
                context: case.context.clone(),
            },
            &[],
        )?;
        // Allow supervisor to consume context before client request.
        std::thread::sleep(Duration::from_millis(20));
        let reply = case.client()?.request(Operation::Handshake, 1)?;
        if reply.reason == "READY" {
            return Err(fail("INELIGIBLE_HANDSHAKE_ACCEPTED"));
        }
        let reply = case.client()?.request(Operation::Arm, 1)?;
        if reply.reason == "READY"
            || !device::regrab(&case.probe)
            || device::key_down(&case.output, 29)
        {
            return Err(fail("INELIGIBLE_ARMED"));
        }
        results.push(serde_json::json!({"scenario":name,"armDenied":true,"otherClientCanGrab":true,"contextEvidence":"root-owned synthetic fixture, not a live logind transition"}));
    }
    let mut case = Case::start(30, uid, gid, 1000)?;
    // No authorized client exists yet. Root passes the unchanged0600 DAC,
    // isolating the server's SO_PEERCRED rejection from busy/DAC failures.
    let mut root_peer = Client::denied_peer(&case.path, 0)?;
    let reply = root_peer.request(Operation::Handshake, 1)?;
    if reply.state != "denied" || reply.reason != "PEER_UID_OR_BUSY" {
        return Err(fail("ROOT_PEER_UID_NOT_DENIED"));
    }
    drop(root_peer);
    let mut wrong = Client::new(&case.path, uid)?;
    if wrong.request(Operation::Handshake, 1).is_ok() {
        return Err(fail("WRONG_UID_REACHED_CONTROL"));
    }
    case.arm()?;
    case.hold_modifiers()?;
    case.context.unlocked = Some(false);
    let revoked = unix::monotonic_ms();
    case.refresh()?;
    case.recovered(revoked, 175, false)?;
    results.push(serde_json::json!({"scenario":"peer-credentials-and-context-revoke","rootPeerPassedDAC":true,"rootPeerUidDeniedBeforeAuthorizedClient":true,"wrongUidDenied":true,"contextRevocationDisarms":true}));
    drop(case);
    // A stopped dormant worker guarantees that a completedF24 press/release
    // is queued before Arm. Key-state snapshots alone would miss this cycle.
    let mut case = Case::start(31, uid, gid, 1000)?;
    if device::synthetic_key_events(&case.output)? != 0 {
        return Err(fail("UNEXPECTED_DORMANT_OUTPUT"));
    }
    case.stop_worker()?;
    case.source.emit(194, 1)?;
    case.source.emit(194, 0)?;
    case.begin_arm()?;
    case.signal_worker(libc::SIGCONT)?;
    case.await_arm()?;
    let until = unix::monotonic_ms() + 100;
    while unix::monotonic_ms() < until {
        if device::synthetic_key_events(&case.output)? != 0 {
            return Err(fail("PREARM_INPUT_REPLAYED"));
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    // Positive control: the exact same observer must see new post-arm input.
    case.source.emit(194, 1)?;
    case.source.emit(194, 0)?;
    let until = unix::monotonic_ms() + 300;
    let mut observed = 0;
    while observed < 2 {
        observed += device::synthetic_key_events(&case.output)?;
        if unix::monotonic_ms() >= until {
            return Err(fail("FRESH_INPUT_NOT_OBSERVED"));
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    results.push(serde_json::json!({"scenario":"prearm-completed-input-backlog","preArmCompletedInputNotForwarded":true,"freshPostArmInputObserved":true}));
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"task":"S0-03","backend":"Debian synthetic libevdev/uinput; no graphical session","physicalHardwareProof":false,"results":results})
        )?
    );
    Ok(())
}
fn main() {
    linuxcast_input_spike::diagnostics::panic_policy("LAB");
    if let Err(error) = run() {
        linuxcast_input_spike::diagnostics::emit("LAB", error.as_ref());
        std::process::exit(3);
    }
}

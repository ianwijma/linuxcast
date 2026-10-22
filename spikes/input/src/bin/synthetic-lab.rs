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
        return Err(fail("DEBIAN13_GUEST_REQUIRED"));
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
                    remote.write_all(&protocol::frame(&request)?)?;
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
    client: Client,
    context: Context,
    path: String,
}
impl Case {
    fn start(index: u32, worker_uid: u32, worker_gid: u32, client_uid: u32) -> Result<Self> {
        let phys = format!("linuxcast-s0-03/manufactured-{}-{index}", unsafe {
            libc::getpid()
        });
        let source = Synthetic::new(device_open("/dev/uinput")?, &phys)?;
        let node = source.node()?;
        let input = device_open(&node)?;
        let probe = device_open(&node)?;
        let output_fd = device_open("/dev/uinput")?;
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
            .stderr(Stdio::null());
        unsafe {
            command.pre_exec(move || {
                if libc::dup2(child_fd, 3) < 0 || libc::fcntl(3, libc::F_SETFD, 0) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
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
        unix::send(
            control.as_raw_fd(),
            &boot,
            &[input.as_raw_fd(), output_fd.as_raw_fd()],
        )?;
        drop(input);
        drop(output_fd);
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
        let client = Client::new(&path, client_uid)?;
        Ok(Self {
            source,
            probe,
            output,
            control,
            supervisor,
            worker: worker_pid,
            worker_pidfd,
            client,
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
    fn arm(&mut self) -> Result<()> {
        let r = self.client.request(Operation::Handshake, 1)?;
        if r.reason != "READY" {
            return Err(fail("LAB_HANDSHAKE_DENIED"));
        }
        let r = self.client.request(Operation::Arm, 1)?;
        if r.reason != "READY" {
            return Err(fail("LAB_ARM_DENIED"));
        }
        let end = unix::monotonic_ms() + 500;
        loop {
            let r = self.client.request(Operation::Status, 1)?;
            if r.state == "armed" {
                break;
            }
            if unix::monotonic_ms() >= end {
                return Err(fail("ARM_ACK_TIMEOUT"));
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        if device::regrab(&self.probe) {
            return Err(fail("NO_ACTUAL_GRAB"));
        }
        Ok(())
    }
    fn hold_modifiers(&self) -> Result<()> {
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
    fn recovered(&mut self, limit: u64, keep_context: bool) -> Result<u64> {
        let start = unix::monotonic_ms();
        loop {
            if device::regrab(&self.probe) && device::removed(&self.output) {
                return Ok(unix::monotonic_ms() - start);
            }
            if unix::monotonic_ms() - start > limit {
                return Err(fail("KERNEL_RECOVERY_TIMEOUT"));
            }
            if keep_context {
                let _ = self.refresh();
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
    check_lab()?;
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
        match *name {
            "worker-sigkill" => {
                case.signal_worker(libc::SIGKILL)?;
            }
            "supervisor-sigkill" => {
                case.supervisor.kill()?;
            }
            "worker-watchdog" => {
                case.signal_worker(libc::SIGSTOP)?;
            }
            "app-lease" => {}
            "emergency" => {
                case.source.emit(97, 1)?;
                case.source.emit(1, 1)?;
            }
            _ => unreachable!(),
        }
        let elapsed = case.recovered(1500, true)?;
        std::thread::sleep(Duration::from_millis(550));
        if !device::regrab(&case.probe) || !device::removed(&case.output) {
            return Err(fail("AUTOMATIC_REARM_DETECTED"));
        }
        results.push(serde_json::json!({"scenario":name,"syntheticModifiersObserved":true,"otherClientRegrabbed":true,"virtualDeviceRemoved":true,"noAutomaticRearm":true,"recoveryMs":elapsed}));
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
        let reply = case.client.request(Operation::Handshake, 1)?;
        if reply.reason == "READY" {
            return Err(fail("INELIGIBLE_HANDSHAKE_ACCEPTED"));
        }
        let reply = case.client.request(Operation::Arm, 1)?;
        if reply.reason == "READY"
            || !device::regrab(&case.probe)
            || device::key_down(&case.output, 29)
        {
            return Err(fail("INELIGIBLE_ARMED"));
        }
        results.push(serde_json::json!({"scenario":name,"armDenied":true,"otherClientCanGrab":true,"contextEvidence":"root-owned synthetic fixture, not a live logind transition"}));
    }
    let mut case = Case::start(30, uid, gid, 1000)?;
    let mut wrong = Client::new(&case.path, uid)?;
    if wrong.request(Operation::Handshake, 1).is_ok() {
        return Err(fail("WRONG_UID_REACHED_CONTROL"));
    }
    case.arm()?;
    case.hold_modifiers()?;
    case.context.unlocked = Some(false);
    case.refresh()?;
    case.recovered(1000, false)?;
    results.push(serde_json::json!({"scenario":"peer-credentials-and-context-revoke","wrongUidDenied":true,"contextRevocationDisarms":true}));
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"task":"S0-03","backend":"Debian synthetic libevdev/uinput; no graphical session","physicalHardwareProof":false,"results":results})
        )?
    );
    Ok(())
}
fn main() {
    if run().is_err() {
        eprintln!("INPUT_LAB_UNAVAILABLE_OR_FAILED");
        std::process::exit(3);
    }
}

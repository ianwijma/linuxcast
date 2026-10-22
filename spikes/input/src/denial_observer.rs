//! Dedicated engineering processes only. No device or worker operation.
use linuxcast_input_spike::{
    Result, context,
    decision::{DecisionState, Veto},
    fail, unix,
};
use serde::{Deserialize, Serialize};
use std::{
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd, RawFd},
        unix::{fs::MetadataExt, net::UnixStream, process::CommandExt},
    },
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

const REQUEST_MS: u64 = 300;
const SAMPLE_MS: u64 = 250;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Bootstrap {
    version: u8,
    uid: u32,
    connection: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    sequence: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Sample {
    version: u8,
    connection: u64,
    sequence: u64,
    epoch: u64,
    observed_ms: u64,
    query_ms: u64,
    veto: Veto,
}
fn sample(report: context::Report, connection: u64, sequence: u64) -> Sample {
    let veto = linuxcast_input_spike::decision::monitor_veto(&report);
    Sample {
        version: 1,
        connection,
        sequence,
        epoch: report.generation,
        observed_ms: report.observed_ms,
        query_ms: report.query_elapsed_ms,
        veto,
    }
}

/// A socketpair's SO_PEERCRED identifies its creator, not the exec child.
/// Ownership/authentication here is the inherited endpoint plus actual
/// direct unreaped Child lifetime. No claimed child identity is accepted.
pub struct Observer {
    channel: OwnedFd,
    child: Child,
    tracker: Tracker,
}
struct Tracker {
    connection: u64,
    sequence: u64,
    epoch: Option<u64>,
    pending: Option<u64>,
    earliest: Option<u64>,
    last_send: Option<u64>,
    terminal: bool,
    evidence: Veto,
}
impl Tracker {
    fn new(connection: u64) -> Self {
        Self {
            connection,
            sequence: 0,
            epoch: None,
            pending: None,
            earliest: None,
            last_send: None,
            terminal: false,
            evidence: Veto::Pending,
        }
    }
    fn invalidate(&mut self, state: &mut DecisionState, veto: Veto) {
        self.terminal = true;
        self.evidence = veto;
        state.invalidate(veto);
    }
    fn ingest(&mut self, state: &mut DecisionState, value: Sample, now: u64) {
        if self.terminal {
            return;
        }
        if self.pending.is_none()
            || value.version != 1
            || value.connection != self.connection
            || value.sequence != self.sequence
            || value.epoch == 0
            || value.observed_ms > now
            || now - value.observed_ms >= linuxcast_input_spike::safety::CONTEXT_MAX_AGE_MS
            || self
                .earliest
                .is_none_or(|started| value.observed_ms < started)
            || value.query_ms > 250
            || self
                .earliest
                .is_none_or(|started| value.query_ms > value.observed_ms.saturating_sub(started))
            || matches!(
                value.veto,
                Veto::Pending | Veto::Terminal | Veto::ChannelDisconnected | Veto::HelperExited
            )
        {
            self.invalidate(state, Veto::InvalidObservation);
            return;
        }
        // Deadline wins over a response queued while this parent was delayed.
        if now.saturating_sub(self.pending.unwrap()) >= REQUEST_MS {
            self.invalidate(state, Veto::Timeout);
            return;
        }
        if self.epoch.is_some_and(|old| old != value.epoch) {
            self.invalidate(
                state,
                if value.veto == Veto::PeerDead {
                    Veto::PeerDead
                } else {
                    Veto::EpochChanged
                },
            );
            return;
        }
        self.epoch = Some(value.epoch);
        self.pending = None;
        self.evidence = value.veto;
        state.observation(value.connection, value.veto, value.observed_ms);
        if matches!(
            value.veto,
            Veto::PeerDead
                | Veto::PeerDisconnected
                | Veto::EpochChanged
                | Veto::InvalidObservation
                | Veto::Unsupported
                | Veto::Timeout
                | Veto::Stale
                | Veto::UnknownContext
        ) {
            self.invalidate(state, value.veto);
        }
    }
}
impl Observer {
    /// Ordinary-UID engineering driver only. No root-to-user launch adapter is
    /// introduced: future supervisor integration requires separate review.
    pub fn start(stream: &UnixStream, connection: u64) -> Result<Self> {
        let uid = unsafe { libc::getuid() };
        if uid == 0 || connection == 0 {
            return Err(fail("DENIAL_NONROOT_CONNECTION_REQUIRED"));
        }
        let executable =
            std::env::current_exe()?.with_file_name("linuxcast-input-spike-denial-helper");
        let meta = std::fs::symlink_metadata(&executable)?;
        if !meta.is_file() || meta.uid() != uid || meta.mode() & 0o022 != 0 {
            return Err(fail("DENIAL_HELPER_BINARY_UNTRUSTED"));
        }
        Self::spawn(stream, connection, executable, "--internal-denial")
    }
    fn spawn(
        stream: &UnixStream,
        connection: u64,
        executable: std::path::PathBuf,
        argument: &str,
    ) -> Result<Self> {
        let uid = unsafe { libc::getuid() };
        let (channel, child_channel) = unix::pair()?;
        let child_fd = child_channel.as_raw_fd();
        let parent = unsafe { libc::getpid() };
        let mut command = Command::new(executable);
        command
            .arg(argument)
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0
                    || libc::getppid() != parent
                {
                    return Err(std::io::Error::from_raw_os_error(libc::EPERM));
                }
                if libc::dup2(child_fd, 3) < 0 || libc::fcntl(3, libc::F_SETFD, 0) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                // Remaining FDs are CLOEXEC at spawn; helper independently closes
                // every descriptor >=4 before accepting its metadata descriptor.
                Ok(())
            });
        }
        let child = command.spawn()?;
        let mut observer = Self {
            channel,
            child,
            tracker: Tracker::new(connection),
        };
        drop(child_channel);
        unix::send(
            observer.channel.as_raw_fd(),
            &Bootstrap {
                version: 1,
                uid,
                connection,
            },
            &[stream.as_raw_fd()],
        )?;
        // Startup is bounded outside any running worker watchdog. No query is
        // needed for this one-byte fixed ready packet.
        let (ready, _) = unix::wait_receive::<Request>(observer.channel.as_raw_fd(), 0, 300)?;
        if ready.sequence != 0 || observer.child.try_wait()?.is_some() {
            return Err(fail("DENIAL_HELPER_START_FAILED"));
        }
        Ok(observer)
    }
    /// One bounded nonblocking packet, no spawn/query or blocking wait.
    pub fn poll(&mut self, state: &mut DecisionState, now: u64) {
        if self.tracker.terminal {
            return;
        }
        if self
            .tracker
            .pending
            .is_some_and(|start| now.saturating_sub(start) >= REQUEST_MS)
        {
            self.tracker.invalidate(state, Veto::Timeout);
            self.kill();
            return;
        }
        match unix::receive::<Sample>(self.channel.as_raw_fd(), 0) {
            Ok(Some((value, _))) => self.tracker.ingest(state, value, unix::monotonic_ms()),
            Ok(None) => {
                // Preserve a queued malformed packet's denial rather than
                // racing it with the helper's exit. WNOHANG never waits.
                if !matches!(self.child.try_wait(), Ok(None)) {
                    self.tracker.invalidate(state, Veto::HelperExited);
                }
            }
            Err(_) => self.tracker.invalidate(state, Veto::ChannelDisconnected),
        }
        if self.tracker.terminal {
            self.kill();
            return;
        }
        if self.tracker.pending.is_none()
            && self
                .tracker
                .last_send
                .is_none_or(|last| now.saturating_sub(last) >= SAMPLE_MS)
        {
            let Some(sequence) = self.tracker.sequence.checked_add(1) else {
                self.tracker.invalidate(state, Veto::InvalidObservation);
                return;
            };
            let started = unix::monotonic_ms();
            if unix::send(self.channel.as_raw_fd(), &Request { sequence }, &[]).is_err() {
                self.tracker.invalidate(state, Veto::ChannelDisconnected);
                self.kill();
                return;
            }
            self.tracker.sequence = sequence;
            self.tracker.earliest = Some(started);
            self.tracker.pending = Some(unix::monotonic_ms());
            self.tracker.last_send = self.tracker.pending;
        }
    }
    fn kill(&mut self) {
        let _ = self.child.kill();
    }
    pub fn evidence(&self) -> Veto {
        self.tracker.evidence
    }
    pub fn stop(&mut self) -> bool {
        self.kill();
        let end = Instant::now() + Duration::from_millis(150);
        while Instant::now() < end {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        false
    }
}
impl Drop for Observer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn empty_caps() -> bool {
    #[repr(C)]
    struct Header {
        version: u32,
        pid: i32,
    }
    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct Data {
        effective: u32,
        permitted: u32,
        inheritable: u32,
    }
    // Linux UAPI linux/capability.h _LINUX_CAPABILITY_VERSION_3, verified
    // against the pinned Debian headers (not a guessed syscall number).
    let mut header = Header {
        version: 0x20080522,
        pid: 0,
    };
    let mut data = [Data::default(); 2];
    unsafe {
        libc::syscall(libc::SYS_capget, &mut header, data.as_mut_ptr()) == 0
            && data
                .iter()
                .all(|d| d.effective == 0 && d.permitted == 0 && d.inheritable == 0)
    }
}
fn close_above_channel() -> Result<()> {
    if unsafe { libc::syscall(libc::SYS_close_range, 4u32, u32::MAX, 0u32) } != 0 {
        return Err(fail("DENIAL_DESCRIPTOR_CLOSURE_FAILED"));
    }
    Ok(())
}
fn unprivileged_identity() -> bool {
    let (mut real, mut effective, mut saved) = (0, 0, 0);
    let (mut gr, mut ge, mut gs) = (0, 0, 0);
    unsafe {
        libc::getresuid(&mut real, &mut effective, &mut saved) == 0
            && libc::getresgid(&mut gr, &mut ge, &mut gs) == 0
            && real != 0
            && real == effective
            && real == saved
            && gr == ge
            && gr == gs
    }
}
pub fn helper() -> Result<()> {
    run_helper(Backend::Live)
}
#[derive(Clone, Copy)]
enum Backend {
    Live,
    #[cfg(test)]
    Fixture(Fixture),
}
fn run_helper(backend: Backend) -> Result<()> {
    // Dedicated env_clear exec; rejection precedes library/symbol work.
    if std::env::vars_os().next().is_some() || !unprivileged_identity() {
        return Err(fail("DENIAL_HELPER_ENV_OR_UID"));
    }
    unix::no_core()?;
    let parent = unsafe { libc::getppid() };
    unix::parent_death(parent as u32)?;
    if !empty_caps() || unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
        return Err(fail("DENIAL_HELPER_PRIVILEGES"));
    }
    close_above_channel()?;
    unsafe {
        libc::alarm(6);
    }
    // Creator credentials validate the expected parent, not this child's UID.
    // Verify the borrowed descriptor before claiming OwnedFd ownership: a
    // direct unsupported invocation may have no FD3 at all.
    let creator = unix::peer(3)?;
    let mut kind = 0i32;
    let mut length = std::mem::size_of::<i32>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            3,
            libc::SOL_SOCKET,
            libc::SO_TYPE,
            (&mut kind as *mut i32).cast(),
            &mut length,
        )
    } != 0
        || length != 4
        || kind != libc::SOCK_SEQPACKET
    {
        return Err(fail("DENIAL_BOOTSTRAP_CHANNEL"));
    }
    if creator.pid != parent
        || creator.uid != unsafe { libc::getuid() }
        || unsafe { libc::getppid() } != parent
    {
        return Err(fail("DENIAL_BOOTSTRAP_PARENT"));
    }
    let channel = unsafe { OwnedFd::from_raw_fd(3) };
    let (boot, mut fds) = unix::wait_receive::<Bootstrap>(channel.as_raw_fd(), 1, 300)?;
    if boot.version != 1 || boot.connection == 0 || boot.uid != unsafe { libc::getuid() } {
        return Err(fail("DENIAL_BOOTSTRAP_INVALID"));
    }
    let fd = fds.remove(0);
    let stream = UnixStream::from(fd);
    unix::send(channel.as_raw_fd(), &Request { sequence: 0 }, &[])?;
    match backend {
        Backend::Live => helper_queries(channel.as_raw_fd(), stream, boot.connection, boot.uid),
        #[cfg(test)]
        Backend::Fixture(case) => {
            fixture_queries(channel.as_raw_fd(), stream, boot.connection, case)
        }
    }
}
fn helper_queries(channel: RawFd, stream: UnixStream, connection: u64, uid: u32) -> Result<()> {
    let mut last = 0u64;
    // Metadata binding is deferred until the first request. Startup never
    // runs the potentially250ms query work on the parent watchdog thread.
    let mut binding: Option<std::result::Result<context::PeerMonitor, context::Denial>> = None;
    loop {
        let (request, _) = unix::wait_receive::<Request>(channel, 0, 1000)?;
        if request.sequence
            != last
                .checked_add(1)
                .ok_or_else(|| fail("DENIAL_SEQUENCE_OVERFLOW"))?
        {
            return Err(fail("DENIAL_SEQUENCE_INVALID"));
        }
        last = request.sequence;
        let started = unix::monotonic_ms();
        if binding.is_none() {
            binding = Some(context::PeerMonitor::bind_connected(
                stream.try_clone()?,
                uid,
            ));
        }
        let value = match binding.as_mut().unwrap() {
            Ok(monitor) => sample(monitor.observe(), connection, last),
            Err(reason) => Sample {
                version: 1,
                connection,
                sequence: last,
                epoch: 1,
                observed_ms: unix::monotonic_ms(),
                query_ms: unix::monotonic_ms().saturating_sub(started),
                veto: linuxcast_input_spike::decision::monitor_denial(reason),
            },
        };
        unix::send(channel, &value, &[])?;
    }
}

static CANCEL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
extern "C" fn cancelled(_: libc::c_int) {
    CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
}
extern "C" fn deadline(_: libc::c_int) {
    unsafe { libc::_exit(124) }
}
pub fn initialize() -> Result<()> {
    unix::no_core()?;
    for (signal, handler) in [
        (libc::SIGALRM, deadline as extern "C" fn(libc::c_int)),
        (libc::SIGTERM, cancelled),
        (libc::SIGINT, cancelled),
    ] {
        let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
        action.sa_sigaction = handler as usize;
        unsafe { libc::sigemptyset(&mut action.sa_mask) };
        if unsafe { libc::sigaction(signal, &action, std::ptr::null_mut()) } != 0 {
            return Err(fail("DENIAL_GUARD_FAILED"));
        }
    }
    // Parent death kills both direct children through their own PDEATHSIG.
    unix::parent_death(unsafe { libc::getppid() } as u32)?;
    unsafe {
        libc::alarm(7);
    }
    Ok(())
}
struct PrivateSocket {
    directory: std::path::PathBuf,
    path: std::path::PathBuf,
}
impl PrivateSocket {
    fn create() -> Result<(Self, std::os::unix::net::UnixListener)> {
        let mut template = b"/tmp/linuxcast-denial-XXXXXX\0".to_vec();
        let ptr = unsafe { libc::mkdtemp(template.as_mut_ptr().cast()) };
        if ptr.is_null() {
            return Err(fail("DENIAL_PRIVATE_DIRECTORY"));
        }
        let directory =
            std::path::PathBuf::from(unsafe { std::ffi::CStr::from_ptr(ptr) }.to_str()?);
        let guard = Self {
            path: directory.join("peer.sock"),
            directory,
        };
        let meta = std::fs::symlink_metadata(&guard.directory)?;
        if !meta.is_dir() || meta.uid() != unsafe { libc::getuid() } || meta.mode() & 0o777 != 0o700
        {
            return Err(fail("DENIAL_PRIVATE_DIRECTORY"));
        }
        let listener = std::os::unix::net::UnixListener::bind(&guard.path)?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&guard.path, std::fs::Permissions::from_mode(0o600))?;
        let meta = std::fs::symlink_metadata(&guard.path)?;
        if meta.uid() != unsafe { libc::getuid() } || meta.mode() & 0o777 != 0o600 {
            return Err(fail("DENIAL_PRIVATE_SOCKET"));
        }
        listener.set_nonblocking(true)?;
        Ok((guard, listener))
    }
    fn remove(&self) -> bool {
        let absent = |result: std::io::Result<()>| {
            result.is_ok() || result.is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
        };
        absent(std::fs::remove_file(&self.path)) && absent(std::fs::remove_dir(&self.directory))
    }
}
impl Drop for PrivateSocket {
    fn drop(&mut self) {
        self.remove();
    }
}
struct Connector {
    pid: libc::pid_t,
    reaped: bool,
}
impl Connector {
    fn stop(&mut self) -> bool {
        if self.reaped {
            return true;
        }
        // Direct child remains unreaped, so its PID cannot be reused.
        unsafe {
            libc::kill(self.pid, libc::SIGKILL);
        }
        let end = Instant::now() + Duration::from_millis(150);
        while Instant::now() < end {
            if unsafe { libc::waitpid(self.pid, std::ptr::null_mut(), libc::WNOHANG) } == self.pid {
                self.reaped = true;
                return true;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        false
    }
}
impl Drop for Connector {
    fn drop(&mut self) {
        self.stop();
    }
}
fn connect_private() -> Result<(PrivateSocket, UnixStream, Connector)> {
    let (private, listener) = PrivateSocket::create()?;
    let parent = unsafe { libc::getpid() };
    let pid = unsafe { libc::fork() };
    if pid < 0 {
        return Err(fail("DENIAL_CONNECTOR_FAILED"));
    }
    if pid == 0 {
        let result = (|| -> Result<()> {
            unix::parent_death(parent as u32)?;
            unix::no_core()?;
            // Driver is single threaded, no library/query work precedes fork.
            if unsafe { libc::syscall(libc::SYS_close_range, 3u32, u32::MAX, 0u32) } != 0 {
                return Err(fail("DENIAL_DESCRIPTOR_CLOSURE_FAILED"));
            }
            let _stream = UnixStream::connect(&private.path)?;
            unsafe {
                libc::alarm(6);
            }
            loop {
                unsafe {
                    libc::pause();
                }
            }
        })();
        unsafe {
            libc::_exit(if result.is_ok() { 0 } else { 3 });
        }
    }
    let client = Connector { pid, reaped: false };
    let end = Instant::now() + Duration::from_millis(300);
    let stream = loop {
        match listener.accept() {
            Ok((stream, _)) => break stream,
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < end =>
            {
                std::thread::sleep(Duration::from_millis(1))
            }
            _ => return Err(fail("DENIAL_CONNECTOR_UNAVAILABLE")),
        }
    };
    let peer = unix::peer(stream.as_raw_fd())?;
    if peer.pid != pid || peer.uid != unsafe { libc::getuid() } {
        return Err(fail("DENIAL_CONNECTOR_MISMATCH"));
    }
    if !private.remove() {
        return Err(fail("DENIAL_PRIVATE_CLEANUP"));
    }
    Ok((private, stream, client))
}
fn eligible_fixture(now: u64) -> linuxcast_input_spike::safety::Context {
    linuxcast_input_spike::safety::Context {
        uid: unsafe { libc::getuid() },
        seat: "seat0".into(),
        session_type: "wayland".into(),
        active: true,
        local: true,
        unlocked: Some(true),
        consented: true,
        generation: 1,
        observed_ms: now,
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicDecision {
    phase: &'static str,
    evidence_veto: Veto,
    decision_veto: Veto,
    can_arm: bool,
    worker_arm_emitted: bool,
}
pub fn driver() -> Result<()> {
    if unsafe { libc::getuid() } == 0 {
        return Err(fail("DENIAL_NONROOT_CONNECTION_REQUIRED"));
    }
    let (_private, stream, mut client) = connect_private()?;
    let mut observer = Observer::start(&stream, 1)?;
    let mut decision = DecisionState::live_denial(unsafe { libc::getuid() }, 1);
    let mut handshake = false;
    let start = Instant::now();
    // No positive state or public fixture override exists. This otherwise
    // eligible trusted fixture is deliberately insufficient for live Arm.
    for index in 0..20 {
        while start.elapsed() < Duration::from_millis(index * 250) {
            if CANCEL.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(fail("DENIAL_CANCELLED"));
            }
            observer.poll(&mut decision, unix::monotonic_ms());
            std::thread::sleep(Duration::from_millis(2));
        }
        if index == 10 && !client.stop() {
            return Err(fail("DENIAL_CONNECTOR_CLEANUP"));
        }
        observer.poll(&mut decision, unix::monotonic_ms());
        let now = unix::monotonic_ms();
        let fixture = eligible_fixture(now);
        if !handshake {
            decision.request(
                linuxcast_input_spike::protocol::Operation::Handshake,
                1,
                &mut handshake,
                Some(&fixture),
                true,
                now,
            );
        }
        // First row is an explicit pending check. Subsequent rows retain the
        // exact live context veto, even once the terminal decision has latched.
        let operation = if index == 0 {
            linuxcast_input_spike::protocol::Operation::Status
        } else if index == 1 {
            linuxcast_input_spike::protocol::Operation::Arm
        } else {
            linuxcast_input_spike::protocol::Operation::Renew
        };
        let outcome = decision.request(operation, 1, &mut handshake, Some(&fixture), true, now);
        if matches!(
            outcome.effect,
            linuxcast_input_spike::decision::Effect::Arm
                | linuxcast_input_spike::decision::Effect::Renew
        ) {
            return Err(fail("DENIAL_UNEXPECTED_WORKER_EFFECT"));
        }
        let row = PublicDecision {
            phase: if index < 10 {
                "BEFORE_CONTROLLED_TERMINATION"
            } else {
                "AFTER_CONTROLLED_TERMINATION"
            },
            evidence_veto: observer.evidence(),
            decision_veto: decision.veto(now).unwrap_or(Veto::InvalidObservation),
            can_arm: false,
            worker_arm_emitted: false,
        };
        let bytes = serde_json::to_vec(&row)?;
        if bytes.len() > 512 {
            return Err(fail("DENIAL_PUBLIC_BOUND"));
        }
        use std::io::Write;
        std::io::stdout().write_all(&bytes)?;
        std::io::stdout().write_all(b"\n")?;
        if matches!(
            observer.evidence(),
            Veto::Unsupported
                | Veto::UnknownContext
                | Veto::InvalidObservation
                | Veto::Timeout
                | Veto::ChannelDisconnected
                | Veto::HelperExited
        ) {
            return Err(fail("DENIAL_OBSERVATION_INCOMPLETE"));
        }
    }
    if !client.stop() || !observer.stop() {
        return Err(fail("DENIAL_OWNED_CLEANUP"));
    }
    unsafe {
        libc::alarm(0);
    }
    Ok(())
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq)]
enum Fixture {
    Normal,
    Stall,
    Disconnect,
    Rights,
    Malformed,
    Trailing,
    Epoch,
    Death,
    Oversized,
    Unsupported,
}
#[cfg(test)]
fn fixture_queries(
    channel: RawFd,
    stream: UnixStream,
    connection: u64,
    case: Fixture,
) -> Result<()> {
    // Private suite deliberately injects this non-CLOEXEC descriptor before
    // spawn. It must be closed before any query backend is selected.
    if unsafe { libc::fcntl(198, libc::F_GETFD) } != -1 {
        return Err(fail("FIXTURE_DESCRIPTOR_NOT_CLOSED"));
    }
    // No library/session/bus calls. Still validate the actual post-fork peer
    // and obtain its SO_PEERPIDFD using primary libc's named socket option.
    let peer = unix::peer(stream.as_raw_fd())?;
    if peer.uid != unsafe { libc::getuid() } {
        return Err(fail("FIXTURE_PEER_UID"));
    }
    let mut pidfd = -1i32;
    let mut len = std::mem::size_of::<i32>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERPIDFD,
            (&mut pidfd as *mut i32).cast(),
            &mut len,
        )
    } != 0
        || len != 4
        || pidfd < 0
    {
        return Err(fail("FIXTURE_PEER_PIDFD"));
    }
    let pidfd = unsafe { OwnedFd::from_raw_fd(pidfd) };
    loop {
        let (request, _) = unix::wait_receive::<Request>(channel, 0, 1000)?;
        if case == Fixture::Stall {
            std::thread::sleep(Duration::from_millis(450));
            continue;
        }
        if case == Fixture::Disconnect {
            return Ok(());
        }
        if case == Fixture::Malformed {
            let bytes = b"{PrivateMalformedCanary";
            unsafe {
                libc::send(
                    channel,
                    bytes.as_ptr().cast(),
                    bytes.len(),
                    libc::MSG_NOSIGNAL,
                );
            }
            return Ok(());
        }
        if case == Fixture::Oversized {
            let bytes = [b'X'; 2048];
            unsafe {
                libc::send(
                    channel,
                    bytes.as_ptr().cast(),
                    bytes.len(),
                    libc::MSG_NOSIGNAL,
                );
            }
            std::thread::sleep(Duration::from_millis(100));
            return Ok(());
        }
        let mut death = libc::pollfd {
            fd: pidfd.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        let dead = unsafe { libc::poll(&mut death, 1, 0) } == 1;
        let value = Sample {
            version: 1,
            connection,
            sequence: request.sequence,
            epoch: if (case == Fixture::Epoch && request.sequence > 1) || dead {
                2
            } else {
                1
            },
            observed_ms: unix::monotonic_ms(),
            query_ms: 0,
            veto: if case == Fixture::Unsupported {
                Veto::Unsupported
            } else if dead {
                Veto::PeerDead
            } else {
                Veto::Remote
            },
        };
        if case == Fixture::Trailing {
            let mut bytes = serde_json::to_vec(&value)?;
            bytes.extend(b"{\"PrivateTrailingCanary\":true}");
            unsafe {
                libc::send(
                    channel,
                    bytes.as_ptr().cast(),
                    bytes.len(),
                    libc::MSG_NOSIGNAL,
                );
            }
            std::thread::sleep(Duration::from_millis(100));
            return Ok(());
        }
        let rights = [stream.as_raw_fd()];
        unix::send(
            channel,
            &value,
            if case == Fixture::Rights {
                &rights
            } else {
                &[]
            },
        )?;
    }
}

#[cfg(test)]
pub fn private_entry(args: &[String]) -> Result<()> {
    if let Some(case) = args.first().and_then(|s| s.strip_prefix("--helper-")) {
        let case = match case {
            "normal" => Fixture::Normal,
            "stall" => Fixture::Stall,
            "disconnect" => Fixture::Disconnect,
            "rights" => Fixture::Rights,
            "malformed" => Fixture::Malformed,
            "trailing" => Fixture::Trailing,
            "epoch" => Fixture::Epoch,
            "death" => Fixture::Death,
            "oversized" => Fixture::Oversized,
            "unsupported" => Fixture::Unsupported,
            _ => return Err(fail("PRIVATE_CASE")),
        };
        return run_helper(Backend::Fixture(case));
    }
    if args == ["--private-abrupt"] || args == ["--private-deadline"] {
        initialize()?;
        let (_private, stream, client) = connect_private()?;
        let observer = Observer::spawn(&stream, 1, std::env::current_exe()?, "--helper-stall")?;
        // Private pipe only, never public runtime output or saved evidence.
        println!(
            "{{\"client\":{},\"helper\":{},\"pathsRemoved\":true}}",
            client.pid,
            observer.child.id()
        );
        use std::io::Write;
        std::io::stdout().flush()?;
        loop {
            unsafe {
                libc::pause();
            }
        }
    }
    if !args.is_empty() {
        return Err(fail("PRIVATE_CASE"));
    }
    tracker_cases();
    let (canary, _) = unix::pair()?;
    if unsafe { libc::dup2(canary.as_raw_fd(), 198) } != 198 {
        return Err(fail("PRIVATE_CANARY_DESCRIPTOR"));
    }
    for (name, want) in [
        ("normal", Veto::Remote),
        ("stall", Veto::Timeout),
        ("disconnect", Veto::HelperExited),
        ("rights", Veto::ChannelDisconnected),
        ("malformed", Veto::ChannelDisconnected),
        ("trailing", Veto::ChannelDisconnected),
        ("epoch", Veto::EpochChanged),
        ("death", Veto::PeerDead),
        ("oversized", Veto::ChannelDisconnected),
        ("unsupported", Veto::Unsupported),
    ] {
        linuxcast_input_spike::diagnostics::stage(match name {
            "normal" => "NORMAL",
            "stall" => "STALL",
            "disconnect" => "DISCONNECT",
            "rights" => "RIGHTS",
            "malformed" => "MALFORMED",
            "trailing" => "TRAILING",
            "epoch" => "EPOCH",
            _ => "DEATH",
        });
        let (_private, stream, mut client) = connect_private()?;
        let mut observer = Observer::spawn(
            &stream,
            1,
            std::env::current_exe()?,
            &format!("--helper-{name}"),
        )?;
        let mut state = DecisionState::live_denial(unsafe { libc::getuid() }, 1);
        let started = Instant::now();
        let mut maximum_poll = Duration::ZERO;
        let mut heartbeat_ticks = 0;
        let mut next_heartbeat = 0;
        let mut killed = false;
        while started.elapsed() < Duration::from_millis(700) {
            // Simulated worker heartbeats on the parent safety-loop thread;
            // deliberately stalled helper must not monopolize this thread.
            if started.elapsed().as_millis() >= next_heartbeat {
                heartbeat_ticks += 1;
                next_heartbeat += 100;
            }
            if name == "death" && started.elapsed() > Duration::from_millis(100) && !killed {
                assert!(client.stop());
                killed = true;
            }
            let before = Instant::now();
            observer.poll(&mut state, unix::monotonic_ms());
            maximum_poll = maximum_poll.max(before.elapsed());
            if observer.evidence() == want {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        // Disconnect may be seen as EOF before child exit, both revoke.
        assert!(
            observer.evidence() == want
                || name == "disconnect" && observer.evidence() == Veto::ChannelDisconnected
        );
        assert!(maximum_poll < Duration::from_millis(75));
        if name == "stall" {
            assert!(heartbeat_ticks >= 3);
        }
        let mut handshake = true;
        let now = unix::monotonic_ms();
        let fixture = eligible_fixture(now);
        let outcome = state.request(
            linuxcast_input_spike::protocol::Operation::Arm,
            1,
            &mut handshake,
            Some(&fixture),
            true,
            now,
        );
        assert_eq!(
            outcome.effect,
            linuxcast_input_spike::decision::Effect::Disarm
        );
        assert!(outcome.veto.is_some());
        assert!(!state.is_armed());
        let latched = outcome.veto;
        state.observation(1, Veto::CompanionUnavailable, now + 1);
        let retried = state.request(
            linuxcast_input_spike::protocol::Operation::Renew,
            1,
            &mut handshake,
            Some(&eligible_fixture(now + 1)),
            true,
            now + 1,
        );
        assert_eq!(
            retried.effect,
            linuxcast_input_spike::decision::Effect::Disarm
        );
        assert_eq!(retried.veto, latched);
        assert!(observer.stop());
        assert!(client.stop());
    }
    println!(
        "{{\"privateNoQueryFixture\":true,\"helperCases\":10,\"boundedNonblockingPoll\":true,\"terminalVeto\":true,\"noWorkerArm\":true,\"liveQueries\":0}}"
    );
    unsafe {
        libc::close(198);
    }
    Ok(())
}
#[cfg(test)]
fn tracker_cases() {
    fn state() -> DecisionState {
        DecisionState::live_denial(1000, 9)
    }
    fn ready() -> Tracker {
        let mut t = Tracker::new(9);
        t.pending = Some(100);
        t.earliest = Some(100);
        t.sequence = 1;
        t
    }
    let value = Sample {
        version: 1,
        connection: 9,
        sequence: 1,
        epoch: 1,
        observed_ms: 110,
        query_ms: 10,
        veto: Veto::Remote,
    };
    let mut forged = serde_json::to_value(&value).unwrap();
    forged["veto"] = serde_json::json!("ALLOW");
    assert!(serde_json::from_value::<Sample>(forged).is_err());
    let mut forged = serde_json::to_value(&value).unwrap();
    forged["uid"] = serde_json::json!(0);
    assert!(serde_json::from_value::<Sample>(forged).is_err());
    let mut t = ready();
    let mut s = state();
    t.ingest(&mut s, value.clone(), 110);
    assert_eq!(s.veto(110), Some(Veto::Remote));
    for field in [0, 1, 2, 3, 4, 5, 6, 7, 8] {
        let mut bad = value.clone();
        match field {
            0 => bad.version = 2,
            1 => bad.connection = 10,
            2 => bad.sequence = 2,
            3 => bad.epoch = 0,
            4 => bad.observed_ms = 111,
            5 => bad.query_ms = 251,
            6 => bad.veto = Veto::Pending,
            7 => bad.observed_ms = 99,
            _ => bad.query_ms = 11,
        };
        let mut t = ready();
        let mut s = state();
        t.ingest(&mut s, bad, 110);
        assert_eq!(s.veto(110), Some(Veto::InvalidObservation));
        t.ingest(&mut s, value.clone(), 110);
        assert_eq!(s.veto(110), Some(Veto::InvalidObservation));
    }
    let mut t = ready();
    let mut s = state();
    t.ingest(&mut s, value.clone(), 400);
    assert_eq!(s.veto(400), Some(Veto::Timeout));
    let mut t = ready();
    let mut s = state();
    t.ingest(&mut s, value.clone(), 110);
    t.pending = Some(120);
    t.sequence = 2;
    let mut changed = value;
    changed.sequence = 2;
    changed.epoch = 2;
    changed.observed_ms = 120;
    t.ingest(&mut s, changed, 120);
    assert_eq!(s.veto(120), Some(Veto::EpochChanged));
    // A new same-UID connection has a different server generation. Neither
    // its sample nor a later original sample can revive the old decision.
    let mut t = ready();
    let mut s = state();
    let mut replacement = Sample {
        version: 1,
        connection: 10,
        sequence: 1,
        epoch: 1,
        observed_ms: 110,
        query_ms: 0,
        veto: Veto::Remote,
    };
    t.ingest(&mut s, replacement.clone(), 110);
    assert_eq!(s.veto(110), Some(Veto::InvalidObservation));
    replacement.connection = 9;
    t.ingest(&mut s, replacement, 110);
    assert_eq!(s.veto(110), Some(Veto::InvalidObservation));
}

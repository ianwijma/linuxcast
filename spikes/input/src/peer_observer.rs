//! Private to the dedicated executable and standalone no-query fixture.
//! Never used by the supervisor/worker or an in-process production adapter.
use linuxcast_input_spike::{Result, context, fail, unix};
use serde::Serialize;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::time::{Duration, Instant};

static CLIENT_PIDFD: AtomicI32 = AtomicI32::new(-1);
static OBSERVER_PIDFD: AtomicI32 = AtomicI32::new(-1);
static GUARD_READY: AtomicBool = AtomicBool::new(false);
static CANCELLED: AtomicBool = AtomicBool::new(false);
extern "C" fn cancel(_: libc::c_int) {
    CANCELLED.store(true, Ordering::SeqCst);
}
extern "C" fn deadline(_: libc::c_int) {
    // Descriptors remain open until the alarm is disabled. Kernel pidfds refer
    // only to this executable's own unreaped children, never a reused PID.
    for slot in [&CLIENT_PIDFD, &OBSERVER_PIDFD] {
        let fd = slot.load(Ordering::SeqCst);
        if fd >= 0 {
            unsafe { libc::syscall(libc::SYS_pidfd_send_signal, fd, libc::SIGKILL, 0, 0) };
        }
    }
    // No potentially blocked stdout/stderr write on the hard deadline path.
    unsafe { libc::_exit(124) };
}
pub fn initialize() -> Result<()> {
    if GUARD_READY.load(Ordering::SeqCst) {
        return Ok(());
    }
    unix::no_core()?;
    CANCELLED.store(false, Ordering::SeqCst);
    for (signal, handler) in [
        (libc::SIGTERM, cancel as extern "C" fn(libc::c_int)),
        (libc::SIGINT, cancel),
        (libc::SIGALRM, deadline),
    ] {
        let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
        action.sa_sigaction = handler as usize;
        unsafe { libc::sigemptyset(&mut action.sa_mask) };
        if unsafe { libc::sigaction(signal, &action, std::ptr::null_mut()) } != 0 {
            return Err(fail("OBSERVER_GUARD_FAILED"));
        }
    }
    let parent = unsafe { libc::getppid() };
    if unsafe { libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) } != 0
        || unsafe { libc::getppid() } != parent
    {
        return Err(fail("OBSERVER_PARENT_CHANGED"));
    }
    if unsafe { libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) } != 0 {
        return Err(fail("OBSERVER_GUARD_FAILED"));
    }
    unsafe { libc::alarm(7) };
    GUARD_READY.store(true, Ordering::SeqCst);
    Ok(())
}

struct PrivateSocket {
    directory: PathBuf,
    path: PathBuf,
    removed: bool,
}
impl PrivateSocket {
    fn create() -> Result<(Self, UnixListener)> {
        let mut template = b"/tmp/linuxcast-peer-observer-XXXXXX\0".to_vec();
        let directory = unsafe { libc::mkdtemp(template.as_mut_ptr().cast()) };
        if directory.is_null() {
            return Err(fail("PRIVATE_DIRECTORY_FAILED"));
        }
        let directory = unsafe { std::ffi::CStr::from_ptr(directory) };
        let directory = PathBuf::from(
            directory
                .to_str()
                .map_err(|_| fail("PRIVATE_DIRECTORY_FAILED"))?,
        );
        let socket = Self {
            path: directory.join("peer.sock"),
            directory,
            removed: false,
        };
        let metadata = std::fs::symlink_metadata(&socket.directory)?;
        if !metadata.is_dir()
            || metadata.uid() != unsafe { libc::getuid() }
            || metadata.mode() & 0o777 != 0o700
        {
            return Err(fail("PRIVATE_DIRECTORY_FAILED"));
        }
        let listener = UnixListener::bind(&socket.path)?;
        std::fs::set_permissions(&socket.path, std::fs::Permissions::from_mode(0o600))?;
        let metadata = std::fs::symlink_metadata(&socket.path)?;
        if metadata.uid() != unsafe { libc::getuid() } || metadata.mode() & 0o777 != 0o600 {
            return Err(fail("PRIVATE_SOCKET_FAILED"));
        }
        listener.set_nonblocking(true)?;
        Ok((socket, listener))
    }
    fn remove(&mut self) -> bool {
        if self.removed {
            return true;
        }
        if let Err(error) = std::fs::remove_file(&self.path)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            return false;
        }
        match std::fs::remove_dir(&self.directory) {
            Ok(()) => {
                self.removed = true;
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.removed = true;
                true
            }
            Err(_) => false,
        }
    }
}
impl Drop for PrivateSocket {
    fn drop(&mut self) {
        self.remove();
    }
}

struct Child {
    pid: libc::pid_t,
    pidfd: OwnedFd,
    status: Option<i32>,
}
impl Child {
    fn capture(pid: libc::pid_t) -> Result<Self> {
        if pid <= 0 {
            return Err(fail("OWNED_CHILD_FAILED"));
        }
        // This is an operational handle to our direct, unreaped fork child,
        // never an authentication fallback for the socket-derived peer pidfd.
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
        if fd < 0 {
            // Still our unreaped child: PID cannot be reused before waitpid.
            unsafe {
                libc::kill(pid, libc::SIGKILL);
                libc::waitpid(pid, std::ptr::null_mut(), 0);
            }
            return Err(fail("OWNED_CHILD_PIDFD_UNAVAILABLE"));
        }
        Ok(Self {
            pid,
            pidfd: unsafe { OwnedFd::from_raw_fd(fd as RawFd) },
            status: None,
        })
    }
    fn poll(&mut self) -> Result<Option<i32>> {
        if self.status.is_none() {
            let mut status = 0;
            let r = unsafe { libc::waitpid(self.pid, &mut status, libc::WNOHANG) };
            if r == self.pid {
                self.status = Some(status);
            } else if r < 0 && std::io::Error::last_os_error().raw_os_error() != Some(libc::EINTR) {
                return Err(fail("OWNED_CHILD_WAIT_FAILED"));
            }
        }
        Ok(self.status)
    }
    fn stop(&mut self) -> bool {
        if self.status.is_some() {
            return true;
        }
        unsafe {
            libc::syscall(
                libc::SYS_pidfd_send_signal,
                self.pidfd.as_raw_fd(),
                libc::SIGKILL,
                0,
                0,
            )
        };
        let end = Instant::now() + Duration::from_millis(100);
        while Instant::now() < end {
            if matches!(self.poll(), Ok(Some(_))) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        false
    }
}
impl Drop for Child {
    fn drop(&mut self) {
        self.stop();
        let fd = self.pidfd.as_raw_fd();
        for slot in [&CLIENT_PIDFD, &OBSERVER_PIDFD] {
            let _ = slot.compare_exchange(fd, -1, Ordering::SeqCst, Ordering::SeqCst);
        }
    }
}

#[derive(Clone, Copy)]
enum Mode {
    Live,
    #[cfg(test)]
    Fixture(Fixture),
}
#[cfg(test)]
#[derive(Clone, Copy, PartialEq)]
pub enum Fixture {
    Normal,
    ConnectFailure,
    Cancelled,
    QueryFailure,
    StalledQuery,
    Descendant,
    ParentDeath,
    HardDeadline,
}

#[derive(Serialize)]
#[serde(tag = "phase", rename_all = "SCREAMING_SNAKE_CASE")]
enum PublicObservation {
    BeforeControlledTermination { report: context::Report },
    AfterControlledTermination { report: context::Report },
    Unavailable { denial: context::Denial },
}
fn emit(value: PublicObservation) -> Result<()> {
    let bytes = serde_json::to_vec(&value)?;
    if bytes.len() > 4096 {
        return Err(fail("OBSERVER_REPORT_BOUND"));
    }
    let mut output = std::io::stdout().lock();
    output.write_all(&bytes)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}
fn child_policy(parent: libc::pid_t) -> bool {
    unix::parent_death(parent as u32).is_ok() && unix::no_core().is_ok()
}
fn client(path: &std::path::Path, listener: RawFd, parent: libc::pid_t, mode: Mode) -> ! {
    if !child_policy(parent) {
        unsafe { libc::_exit(3) };
    }
    unsafe { libc::close(listener) };
    #[cfg(test)]
    if matches!(mode, Mode::Fixture(Fixture::ConnectFailure)) {
        unsafe { libc::_exit(3) };
    }
    // The connection is created here AFTER fork. A pre-fork socketpair would
    // authenticate the wrong creator in SO_PEERCRED/SO_PEERPIDFD.
    let result = (|| -> Result<()> {
        let mut stream = UnixStream::connect(path)?;
        #[cfg(test)]
        if matches!(mode, Mode::Fixture(Fixture::Descendant)) {
            let connector = unsafe { libc::getpid() };
            let child = unsafe { libc::fork() };
            if child < 0 {
                return Err(fail("FIXTURE_CHILD_FAILED"));
            }
            if child == 0 {
                if !child_policy(connector) {
                    unsafe { libc::_exit(3) };
                }
                unsafe { libc::alarm(2) };
                loop {
                    unsafe { libc::pause() };
                }
            }
        }
        #[cfg(not(test))]
        let _ = mode;
        let mut byte = [0];
        // No application protocol/content is sent over this socket.
        if stream.read(&mut byte)? != 0 {
            return Err(fail("UNEXPECTED_PEER_CONTENT"));
        }
        Ok(())
    })();
    unsafe { libc::_exit(if result.is_ok() { 0 } else { 3 }) };
}
fn query(
    stream: UnixStream,
    mut terminated: UnixStream,
    parent: libc::pid_t,
    mode: Mode,
    interval: Duration,
) -> ! {
    if !child_policy(parent) {
        unsafe { libc::_exit(3) };
    }
    let result = (|| -> Result<()> {
        #[cfg(test)]
        if matches!(
            mode,
            Mode::Fixture(Fixture::StalledQuery | Fixture::HardDeadline)
        ) {
            loop {
                unsafe { libc::pause() };
            }
        }
        #[cfg(test)]
        if matches!(mode, Mode::Fixture(Fixture::QueryFailure)) {
            return Err(fail("FIXTURE_QUERY_FAILURE"));
        }
        let (mut monitor, _held_fixture_stream): (
            Option<context::PeerMonitor>,
            Option<UnixStream>,
        ) = match mode {
            Mode::Live => {
                match context::PeerMonitor::bind_connected(stream, unsafe { libc::getuid() }) {
                    Ok(monitor) => (Some(monitor), None),
                    Err(denial) => {
                        emit(PublicObservation::Unavailable { denial })?;
                        return Err(fail("PEER_MONITOR_UNAVAILABLE"));
                    }
                }
            }
            #[cfg(test)]
            Mode::Fixture(_) => (None, Some(stream)),
        };
        let started = Instant::now();
        let mut before_generation = 0;
        let mut after_generation = None;
        let mut evidence_valid = true;
        for index in 0..20 {
            if index == 10 {
                terminated.set_read_timeout(Some(Duration::from_millis(1000)))?;
                let mut fixed = [0];
                terminated.read_exact(&mut fixed)?;
                if fixed != [b'D'] {
                    return Err(fail("TERMINATION_NOT_OBSERVED"));
                }
            }
            let after = index >= 10;
            let report = match monitor.as_mut() {
                Some(monitor) => monitor.observe(),
                #[cfg(test)]
                None => fixture_report(after),
                #[cfg(not(test))]
                None => return Err(fail("PEER_MONITOR_UNAVAILABLE")),
            };
            evidence_valid &= report.monitor_only
                && !report.can_arm
                && !report.companion_available
                && !report.lock_known;
            if !after {
                before_generation = before_generation.max(report.generation);
                evidence_valid &= report.snapshot_fresh
                    && report.pid_session_bound
                    && report.uid_matched
                    && report.logind_owner_root;
            } else {
                evidence_valid &= report.denials.contains(&context::Denial::PeerDead)
                    && !report.snapshot_fresh
                    && !report.pid_session_bound
                    && !report.uid_matched
                    && report.generation > before_generation
                    && after_generation.is_none_or(|generation| generation == report.generation);
                after_generation = Some(report.generation);
            }
            if matches!(mode, Mode::Live) {
                emit(if after {
                    PublicObservation::AfterControlledTermination { report }
                } else {
                    PublicObservation::BeforeControlledTermination { report }
                })?;
            }
            std::thread::sleep((interval * (index + 1)).saturating_sub(started.elapsed()));
        }
        if !evidence_valid {
            return Err(fail("PEER_OBSERVATION_INCOMPLETE"));
        }
        Ok(())
    })();
    unsafe { libc::_exit(if result.is_ok() { 0 } else { 3 }) };
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub complete: bool,
    pub client_reaped: bool,
    pub observer_reaped: bool,
    pub temporary_directory_removed: bool,
    pub descendants_reaped: u32,
    pub descendants_absent: bool,
    pub deadline_triggered: bool,
}
fn execute(mode: Mode) -> Result<Summary> {
    initialize()?;
    let started = Instant::now();
    #[cfg(test)]
    let short = matches!(mode, Mode::Fixture(f) if !matches!(f, Fixture::ParentDeath | Fixture::HardDeadline));
    #[cfg(not(test))]
    let short = false;
    let interval = Duration::from_millis(if short { 5 } else { 250 });
    let limit = Duration::from_millis(if short { 250 } else { 6500 });
    let (mut private, listener) = PrivateSocket::create()?;
    let parent = unsafe { libc::getpid() };
    let pid = unsafe { libc::fork() };
    if pid == 0 {
        client(&private.path, listener.as_raw_fd(), parent, mode);
    }
    let mut client = Child::capture(pid)?;
    CLIENT_PIDFD.store(client.pidfd.as_raw_fd(), Ordering::SeqCst);
    let mut observer = None;
    let result = (|| -> Result<()> {
        let (stream, _) = loop {
            match listener.accept() {
                Ok(value) => break value,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if started.elapsed() >= Duration::from_millis(1000)
                        || CANCELLED.load(Ordering::SeqCst)
                        || client.poll()?.is_some()
                    {
                        return Err(fail("PRIVATE_CONNECT_FAILED"));
                    }
                    std::thread::sleep(Duration::from_millis(1));
                }
                Err(_) => return Err(fail("PRIVATE_CONNECT_FAILED")),
            }
        };
        let credentials = unix::peer(stream.as_raw_fd())?;
        if credentials.pid != client.pid || credentials.uid != unsafe { libc::getuid() } {
            return Err(fail("CONTROLLED_PEER_MISMATCH"));
        }
        // Remove all temporary pathnames before any session query can block.
        if !private.remove() {
            return Err(fail("PRIVATE_CLEANUP_FAILED"));
        }
        let (mut notifier, notification) = UnixStream::pair()?;
        let pid = unsafe { libc::fork() };
        if pid == 0 {
            drop(notifier);
            drop(listener);
            query(stream, notification, parent, mode, interval);
        }
        drop(stream);
        drop(notification);
        observer = Some(Child::capture(pid)?);
        let observer = observer.as_mut().unwrap();
        OBSERVER_PIDFD.store(observer.pidfd.as_raw_fd(), Ordering::SeqCst);
        #[cfg(test)]
        if matches!(
            mode,
            Mode::Fixture(Fixture::ParentDeath | Fixture::HardDeadline)
        ) {
            // Private fixture-only in-memory transport; never production output.
            println!(
                "{{\"client\":{},\"observer\":{},\"temporaryDirectoryRemoved\":true}}",
                client.pid, observer.pid
            );
            std::io::stdout().flush()?;
        }
        #[cfg(test)]
        if matches!(mode, Mode::Fixture(Fixture::HardDeadline)) {
            // Deliberately stall the guardian only in the separate fixture.
            // Real kernel SIGALRM must kill its exact children and exit124.
            loop {
                unsafe { libc::pause() };
            }
        }
        #[cfg(test)]
        if matches!(mode, Mode::Fixture(Fixture::Cancelled)) {
            unsafe { libc::raise(libc::SIGTERM) };
        }
        let mut terminated = false;
        while observer.poll()?.is_none() {
            if CANCELLED.load(Ordering::SeqCst) || started.elapsed() >= limit {
                break;
            }
            if !terminated && started.elapsed() >= interval * 10 {
                if client.poll()?.is_some() || !client.stop() {
                    return Err(fail("CONTROLLED_CLIENT_STOP_FAILED"));
                }
                notifier.write_all(b"D")?;
                terminated = true;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        Ok(())
    })();
    let deadline_triggered = started.elapsed() >= limit;
    let observer_reaped = observer.as_mut().is_none_or(Child::stop);
    let client_reaped = client.stop();
    let temporary_directory_removed = private.remove();
    let mut descendants_reaped = 0;
    let mut descendants_absent = false;
    let reap_end = Instant::now() + Duration::from_millis(100);
    loop {
        let mut status = 0;
        let pid = unsafe { libc::waitpid(-1, &mut status, libc::WNOHANG) };
        if pid > 0 {
            descendants_reaped += 1;
            continue;
        }
        if pid < 0 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ECHILD) {
            descendants_absent = true;
            break;
        }
        if Instant::now() >= reap_end {
            break;
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    let complete = result.is_ok()
        && observer
            .as_ref()
            .and_then(|child| child.status)
            .is_some_and(|status| libc::WIFEXITED(status) && libc::WEXITSTATUS(status) == 0)
        && client_reaped
        && temporary_directory_removed
        && descendants_absent
        && !deadline_triggered
        && !CANCELLED.load(Ordering::SeqCst);
    // Clear registered handles before descriptor close/reuse. Production keeps
    // the original hard alarm armed through final diagnostics/process exit.
    #[cfg(test)]
    unsafe {
        libc::alarm(0)
    };
    CLIENT_PIDFD.store(-1, Ordering::SeqCst);
    OBSERVER_PIDFD.store(-1, Ordering::SeqCst);
    Ok(Summary {
        complete,
        client_reaped,
        observer_reaped,
        temporary_directory_removed,
        descendants_reaped,
        descendants_absent,
        deadline_triggered,
    })
}
pub fn run() -> Result<()> {
    let summary = execute(Mode::Live)?;
    if !summary.complete || !summary.observer_reaped {
        return Err(fail("PRIVATE_PEER_OBSERVATION_INCOMPLETE"));
    }
    Ok(())
}

#[cfg(test)]
pub fn run_fixture(fixture: Fixture) -> Result<Summary> {
    execute(Mode::Fixture(fixture))
}
#[cfg(test)]
fn fixture_report(after: bool) -> context::Report {
    // Private mock data, never a libsystemd call or a production fixture mode.
    context::Report {
        monitor_only: true,
        can_arm: false,
        companion_available: false,
        lock_known: false,
        generation: if after { 2 } else { 1 },
        observed_ms: 0,
        query_elapsed_ms: 0,
        snapshot_fresh: !after,
        pid_session_bound: !after,
        uid_matched: !after,
        logind_owner_root: !after,
        active: false,
        local: false,
        graphical: false,
        user_session: false,
        seat_zero: false,
        logind_lock_hint_known: false,
        logind_lock_hint_locked: false,
        denials: if after {
            vec![
                context::Denial::PeerDead,
                context::Denial::CompanionUnavailable,
                context::Denial::UnknownLock,
            ]
        } else {
            vec![
                context::Denial::CompanionUnavailable,
                context::Denial::UnknownLock,
            ]
        },
    }
}

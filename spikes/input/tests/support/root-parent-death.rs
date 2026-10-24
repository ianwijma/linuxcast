//! Root-only container fixture: real fixed helper, no query or input operation.
//! Private PID values never leave the anonymous owned fixture protocol.
use super::*;
use std::os::linux::net::SocketAddrExt;
use std::os::unix::net::{SocketAddr, UnixListener};

const ORDINARY: u32 = 65534; // Debian's existing nobody/nogroup account.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Ready {
    helper: i32,
    identity_checked: bool,
}
struct Process {
    pid: i32,
    fd: OwnedFd,
    reaped: bool,
}
impl Process {
    fn own_child(pid: i32) -> Result<Self> {
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
        if fd < 0 {
            // This is our direct, unreaped fork child with no other reaper.
            unsafe {
                libc::kill(pid, libc::SIGKILL);
                libc::waitpid(pid, std::ptr::null_mut(), 0);
            }
            return Err(fail("ROOT_DEATH_PIDFD_REQUIRED"));
        }
        Ok(Self {
            pid,
            fd: unsafe { OwnedFd::from_raw_fd(fd as i32) },
            reaped: false,
        })
    }
    fn alive(&self) -> bool {
        let mut p = libc::pollfd {
            fd: self.fd.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        unsafe { libc::poll(&mut p, 1, 0) == 0 }
    }
    fn kill(&self) -> bool {
        self.reaped
            || unsafe {
                libc::syscall(
                    libc::SYS_pidfd_send_signal,
                    self.fd.as_raw_fd(),
                    libc::SIGKILL,
                    0,
                    0,
                ) == 0
            }
    }
    fn wait(&mut self, end: Instant) -> Result<i32> {
        if self.reaped {
            return Err(fail("ROOT_DEATH_ALREADY_REAPED"));
        }
        loop {
            let mut status = 0;
            let got = unsafe { libc::waitpid(self.pid, &mut status, libc::WNOHANG) };
            if got == self.pid {
                self.reaped = true;
                return Ok(status);
            }
            if got < 0 || Instant::now() >= end {
                return Err(fail("ROOT_DEATH_REAP_FAILED"));
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn stop(&mut self) -> bool {
        self.reaped
            || self.kill()
                && self
                    .wait(Instant::now() + Duration::from_millis(500))
                    .is_ok()
    }
}
#[derive(Default)]
struct Family {
    driver: Option<Process>,
    helper: Option<Process>,
    connector: Option<Process>,
}
impl Family {
    fn stop(&mut self) -> bool {
        // Killing/reaping the direct parent first adopts its helper into this
        // fixture subreaper. Attempt every owned cleanup even after failure.
        let a = self.driver.as_mut().is_none_or(Process::stop);
        let b = self.helper.as_mut().is_none_or(Process::stop);
        let c = self.connector.as_mut().is_none_or(Process::stop);
        a && b && c
    }
}
impl Drop for Family {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn identity(pid: i32, parent: i32) -> Result<()> {
    let raw = std::fs::read_to_string(format!("/proc/{pid}/status"))?;
    let field = |name: &str| -> Result<Vec<u32>> {
        let line = raw
            .lines()
            .find_map(|s| s.strip_prefix(name))
            .ok_or_else(|| fail("ROOT_DEATH_STATUS_FIELD"))?;
        line.split_whitespace()
            .map(|s| s.parse().map_err(|_| fail("ROOT_DEATH_STATUS_TYPE")))
            .collect()
    };
    if field("Uid:")? != [ORDINARY; 4]
        || field("Gid:")? != [ORDINARY; 4]
        || !field("Groups:")?.is_empty()
        || field("PPid:")? != [parent as u32]
        || field("NoNewPrivs:")? != [1]
    {
        return Err(fail("ROOT_DEATH_IDENTITY_NOT_DROPPED"));
    }
    for key in ["CapInh:", "CapPrm:", "CapEff:", "CapAmb:"] {
        if raw
            .lines()
            .find_map(|s| s.strip_prefix(key))
            .is_none_or(|v| v.trim() != "0000000000000000")
        {
            return Err(fail("ROOT_DEATH_CAPABILITIES"));
        }
    }
    Ok(())
}

pub(super) fn run() -> Result<()> {
    if !peer_bootstrap::root_identity() {
        return Err(fail("ROOT_DEATH_REAL_ROOT_REQUIRED"));
    }
    // No pretend root path: actual setgroups/setresuid/setresgid and production
    // fixed /opt helper are required. Missing capabilities/account/binary fail.
    child_reaping_policy()?;
    let address = SocketAddr::from_abstract_name(
        format!("linuxcast-root-death-{}", unsafe { libc::getpid() }).as_bytes(),
    )?;
    let listener = UnixListener::bind_addr(&address)?;
    listener.set_nonblocking(true)?;
    let mut family = Family::default();
    let connector = unsafe { libc::fork() };
    if connector < 0 {
        return Err(fail("ROOT_DEATH_FORK_FAILED"));
    }
    if connector == 0 {
        drop(listener);
        let result = (|| -> Result<()> {
            peer_bootstrap::drop_root_identity(ORDINARY, ORDINARY, unsafe { libc::getppid() })?;
            let _connected = UnixStream::connect_addr(&address)?;
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
    family.connector = Some(Process::own_child(connector)?);
    let result = (|| -> Result<u128> {
        let end = Instant::now() + Duration::from_secs(2);
        let stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < end => {
                    std::thread::sleep(Duration::from_millis(1))
                }
                Err(_) => return Err(fail("ROOT_DEATH_CONNECT_FAILED")),
            }
        };
        drop(listener);
        let (report, child_report) = unix::pair()?;
        let driver = unsafe { libc::fork() };
        if driver < 0 {
            return Err(fail("ROOT_DEATH_FORK_FAILED"));
        }
        if driver == 0 {
            drop(report);
            let result = (|| -> Result<()> {
                let peer = RootPeer::bind(stream, ORDINARY)?;
                let observer = Observer::start_root(&peer, 1)?;
                let pid = observer.child.id() as i32;
                identity(pid, unsafe { libc::getpid() })?;
                let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
                if fd < 0 {
                    return Err(fail("ROOT_DEATH_PIDFD_REQUIRED"));
                }
                let fd = unsafe { OwnedFd::from_raw_fd(fd as i32) };
                // Hold a duplicate parent endpoint externally, so parent death
                // cannot be mistaken for EOF-triggered cooperative helper exit.
                unix::send(
                    child_report.as_raw_fd(),
                    &Ready {
                        helper: pid,
                        identity_checked: true,
                    },
                    &[fd.as_raw_fd(), observer.channel.as_raw_fd()],
                )?;
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
        drop(child_report);
        family.driver = Some(Process::own_child(driver)?);
        let (ready, mut descriptors) = unix::wait_receive::<Ready>(report.as_raw_fd(), 2, 1000)?;
        if !ready.identity_checked || ready.helper <= 1 {
            return Err(fail("ROOT_DEATH_NOT_READY"));
        }
        let held_channel = descriptors
            .pop()
            .ok_or_else(|| fail("ROOT_DEATH_CHANNEL_MISSING"))?;
        let helper_fd = descriptors
            .pop()
            .ok_or_else(|| fail("ROOT_DEATH_PIDFD_MISSING"))?;
        family.helper = Some(Process {
            pid: ready.helper,
            fd: helper_fd,
            reaped: false,
        });
        let helper = family.helper.as_ref().unwrap();
        if !helper.alive() {
            return Err(fail("ROOT_DEATH_HELPER_NOT_LIVE"));
        }
        identity(ready.helper, driver)?; // external credentials while pidfd live
        if !helper.alive() {
            return Err(fail("ROOT_DEATH_HELPER_NOT_LIVE"));
        }
        let started = Instant::now();
        if !family.driver.as_ref().unwrap().kill() {
            return Err(fail("ROOT_DEATH_PARENT_KILL_FAILED"));
        }
        let end = started + Duration::from_millis(500);
        let parent_status = family.driver.as_mut().unwrap().wait(end)?;
        let helper_status = family.helper.as_mut().unwrap().wait(end)?;
        let elapsed = started.elapsed().as_millis();
        // These waits precede ANY helper cleanup signal. A normal channel-loss
        // exit, six-second alarm or our later cleanup cannot satisfy this proof.
        if !libc::WIFSIGNALED(parent_status)
            || libc::WTERMSIG(parent_status) != libc::SIGKILL
            || !libc::WIFSIGNALED(helper_status)
            || libc::WTERMSIG(helper_status) != libc::SIGKILL
            || !family.connector.as_ref().unwrap().alive()
        {
            return Err(fail("ROOT_DEATH_SIGNAL_NOT_ESTABLISHED"));
        }
        drop(held_channel);
        Ok(elapsed)
    })();
    let cleanup = family.stop();
    let elapsed = result?;
    if !cleanup {
        return Err(fail("ROOT_DEATH_CLEANUP_FAILED"));
    }
    println!(
        "{{\"actualRootDropObserved\":true,\"externalDirectParentDeathTrial\":true,\"helperKilledBySigkillBeforeCleanup\":true,\"controlEndpointHeldOpen\":true,\"credentialGroupCapabilityChecks\":true,\"noQueryRequestsSent\":true,\"noWorkerArm\":true,\"inputDevicesUsed\":false,\"ownedCleanupVerified\":true,\"parentDeathObservedMs\":{elapsed}}}"
    );
    Ok(())
}

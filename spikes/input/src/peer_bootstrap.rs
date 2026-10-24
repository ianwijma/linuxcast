//! Private engineering bootstrap only. No grant, device or input operation.
use crate::{Result, fail, unix};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::{fs::MetadataExt, net::UnixStream};

fn option(fd: RawFd, name: i32) -> Result<i32> {
    let mut value = -1i32;
    let mut length = std::mem::size_of::<i32>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_SOCKET,
            name,
            (&mut value as *mut i32).cast(),
            &mut length,
        )
    } != 0
        || length as usize != std::mem::size_of::<i32>()
    {
        return Err(fail("DENIAL_SOCKET_METADATA"));
    }
    Ok(value)
}
pub fn socket_kind(fd: RawFd, kind: i32) -> Result<()> {
    if option(fd, libc::SO_DOMAIN)? != libc::AF_UNIX || option(fd, libc::SO_TYPE)? != kind {
        return Err(fail("DENIAL_SOCKET_KIND"));
    }
    Ok(())
}
fn peer_pidfd(fd: RawFd) -> Result<OwnedFd> {
    let value = option(fd, libc::SO_PEERPIDFD)?;
    if value < 0 {
        return Err(fail("DENIAL_PARENT_PIDFD"));
    }
    let result = unsafe { OwnedFd::from_raw_fd(value) };
    if unsafe { libc::fcntl(result.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) } != 0 {
        return Err(fail("DENIAL_PARENT_PIDFD"));
    }
    Ok(result)
}
fn alive(fd: RawFd) -> bool {
    let mut p = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    unsafe { libc::poll(&mut p, 1, 0) == 0 }
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ParentKind {
    SameUid,
    Root,
}
fn valid_creator(peer: &libc::ucred, parent: i32, uid: u32, kind: ParentKind) -> bool {
    parent > 1 && peer.pid == parent && peer.uid == if kind == ParentKind::Root { 0 } else { uid }
}
/// Socketpair creator credentials authenticate the actual parent, not a child.
/// Stable kernel creator pidfd and PDEATHSIG bracket every bootstrap/query.
pub struct ParentBinding {
    pid: i32,
    uid: u32,
    pidfd: OwnedFd,
}
impl ParentBinding {
    pub fn bind(channel: RawFd, kind: ParentKind) -> Result<Self> {
        socket_kind(channel, libc::SOCK_SEQPACKET)?;
        let pid = unsafe { libc::getppid() };
        let peer = unix::peer(channel)?;
        if !valid_creator(&peer, pid, unsafe { libc::getuid() }, kind) {
            return Err(fail("DENIAL_BOOTSTRAP_PARENT"));
        }
        let pidfd = peer_pidfd(channel)?;
        unix::parent_death(pid as u32)?;
        let result = Self {
            pid,
            uid: peer.uid,
            pidfd,
        };
        result.check(channel)?;
        Ok(result)
    }
    pub fn check(&self, channel: RawFd) -> Result<()> {
        let peer = unix::peer(channel)?;
        let mut p = libc::pollfd {
            fd: channel,
            events: libc::POLLRDHUP,
            revents: 0,
        };
        if unsafe { libc::getppid() } != self.pid
            || peer.pid != self.pid
            || peer.uid != self.uid
            || !alive(self.pidfd.as_raw_fd())
            || unsafe { libc::poll(&mut p, 1, 0) } < 0
            || p.revents & (libc::POLLHUP | libc::POLLRDHUP | libc::POLLERR | libc::POLLNVAL) != 0
        {
            return Err(fail("DENIAL_BOOTSTRAP_PARENT_LOST"));
        }
        Ok(())
    }
}
pub fn root_identity() -> bool {
    let (mut r, mut e, mut s) = (0, 0, 0);
    unsafe { libc::getresuid(&mut r, &mut e, &mut s) == 0 && r == 0 && e == 0 && s == 0 }
}
fn account_valid(expected: u32, actual: u32, primary_gid: u32) -> bool {
    expected != 0
        && expected != u32::MAX
        && actual == expected
        && primary_gid != 0
        && primary_gid != u32::MAX
}
fn account_gid(uid: u32) -> Result<u32> {
    // Pre-worker bootstrap only. Bounded memory; enclosing independent7s guard
    // covers a stalled NSS backend. Never called from the watchdog loop.
    let mut buffer = vec![0u8; 64 * 1024];
    let mut value: libc::passwd = unsafe { std::mem::zeroed() };
    let mut found = std::ptr::null_mut();
    let code = unsafe {
        libc::getpwuid_r(
            uid,
            &mut value,
            buffer.as_mut_ptr().cast(),
            buffer.len(),
            &mut found,
        )
    };
    if code != 0 || found.is_null() || !account_valid(uid, value.pw_uid, value.pw_gid) {
        return Err(fail("DENIAL_AUTHORIZED_ACCOUNT_UNAVAILABLE"));
    }
    Ok(value.pw_gid)
}
/// Constructible only from a root-authorized UID matching the connected kernel
/// peer. The peer's GID is not an authority or the helper's primary group.
pub struct RootPeer {
    stream: UnixStream,
    uid: u32,
    gid: u32,
    pid: i32,
    pidfd: OwnedFd,
}
impl RootPeer {
    pub fn bind(stream: UnixStream, authorized_uid: u32) -> Result<Self> {
        if !root_identity() || authorized_uid == 0 || authorized_uid == u32::MAX {
            return Err(fail("DENIAL_ROOT_AUTHORIZATION_REQUIRED"));
        }
        socket_kind(stream.as_raw_fd(), libc::SOCK_STREAM)?;
        let peer = unix::peer(stream.as_raw_fd())?;
        if peer.uid != authorized_uid || peer.pid <= 1 {
            return Err(fail("DENIAL_AUTHORIZED_PEER_MISMATCH"));
        }
        let pidfd = peer_pidfd(stream.as_raw_fd())?;
        if !alive(pidfd.as_raw_fd()) {
            return Err(fail("DENIAL_AUTHORIZED_PEER_DEAD"));
        }
        let gid = account_gid(peer.uid)?;
        let value = Self {
            stream,
            uid: peer.uid,
            gid,
            pid: peer.pid,
            pidfd,
        };
        value.check()?;
        Ok(value)
    }
    pub fn check(&self) -> Result<()> {
        let peer = unix::peer(self.stream.as_raw_fd())?;
        if !alive(self.pidfd.as_raw_fd()) || peer.pid != self.pid || peer.uid != self.uid {
            return Err(fail("DENIAL_AUTHORIZED_PEER_DEAD"));
        }
        Ok(())
    }
    pub fn stream(&self) -> &UnixStream {
        &self.stream
    }
    pub fn uid(&self) -> u32 {
        self.uid
    }
    pub fn gid(&self) -> u32 {
        self.gid
    }
}
pub const ROOT_HELPER: &str = "/opt/linuxcast-input-spike/linuxcast-input-spike-denial-helper";
pub fn root_helper() -> Result<std::path::PathBuf> {
    for name in ["/opt", "/opt/linuxcast-input-spike"] {
        let m = std::fs::symlink_metadata(name)?;
        if !m.is_dir() || m.uid() != 0 || m.mode() & 0o022 != 0 {
            return Err(fail("DENIAL_HELPER_DIRECTORY_UNTRUSTED"));
        }
    }
    let m = std::fs::symlink_metadata(ROOT_HELPER)?;
    if !m.is_file() || m.uid() != 0 || m.mode() & 0o6022 != 0 {
        return Err(fail("DENIAL_HELPER_BINARY_UNTRUSTED"));
    }
    Ok(ROOT_HELPER.into())
}
#[repr(C)]
struct Header {
    version: u32,
    pid: i32,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CapData {
    effective: u32,
    permitted: u32,
    inheritable: u32,
}
/// Pre-exec syscall-only credential drop; account lookup happened in the parent.
pub fn drop_root_identity(uid: u32, gid: u32, parent: i32) -> std::io::Result<()> {
    let mut header = Header {
        version: 0x20080522,
        pid: 0,
    };
    let mut data = [CapData::default(); 2];
    unsafe {
        if uid == 0 || gid == 0 || uid == u32::MAX || gid == u32::MAX || libc::setgroups(0, std::ptr::null()) != 0
            || libc::prctl(libc::PR_SET_KEEPCAPS, 0, 0, 0, 0) != 0
            || libc::prctl(libc::PR_CAP_AMBIENT, libc::PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) != 0
            || libc::setresgid(gid, gid, gid) != 0 || libc::setresuid(uid, uid, uid) != 0
            || libc::prctl(libc::PR_SET_DUMPABLE, 0) != 0
            || libc::syscall(libc::SYS_capset, &mut header, data.as_mut_ptr()) != 0
            || libc::prctl(libc::PR_CAP_AMBIENT, libc::PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
            // Credential changes clear PDEATHSIG: install only after the drop.
            || libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 || libc::getppid() != parent
        {
            return Err(std::io::Error::from_raw_os_error(libc::EPERM));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creator_authentication_does_not_confuse_root_parent_and_child() {
        let p = libc::ucred {
            pid: 12,
            uid: 0,
            gid: 0,
        };
        assert!(valid_creator(&p, 12, 1000, ParentKind::Root));
        assert!(!valid_creator(&p, 12, 1000, ParentKind::SameUid));
        assert!(!valid_creator(&p, 13, 1000, ParentKind::Root));
        assert!(!valid_creator(
            &libc::ucred { uid: 1000, ..p },
            12,
            1000,
            ParentKind::Root
        ));
        assert!(valid_creator(
            &libc::ucred { uid: 1000, ..p },
            12,
            1000,
            ParentKind::SameUid
        ));
    }
    #[test]
    fn account_requires_exact_authorized_uid_and_nonroot_primary_group() {
        assert!(account_valid(1000, 1000, 1001));
        for (expected, actual, group) in [
            (0, 0, 1),
            (1000, 1001, 1),
            (1000, 1000, 0),
            (1000, 1000, u32::MAX),
        ] {
            assert!(!account_valid(expected, actual, group));
        }
    }
}

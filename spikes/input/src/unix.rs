use crate::{Result, fail};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    io, mem,
    os::fd::{FromRawFd, OwnedFd, RawFd},
    time::Instant,
};

pub fn monotonic_ms() -> u64 {
    let mut value = mem::MaybeUninit::<libc::timespec>::uninit();
    // CLOCK_MONOTONIC is shared by all processes in this single guest.
    unsafe {
        assert_eq!(
            libc::clock_gettime(libc::CLOCK_MONOTONIC, value.as_mut_ptr()),
            0
        );
        let t = value.assume_init();
        t.tv_sec as u64 * 1000 + t.tv_nsec as u64 / 1_000_000
    }
}
pub fn pair() -> Result<(OwnedFd, OwnedFd)> {
    let mut fds = [-1; 2];
    if unsafe {
        libc::socketpair(
            libc::AF_UNIX,
            libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC | libc::SOCK_NONBLOCK,
            0,
            fds.as_mut_ptr(),
        )
    } != 0
    {
        return Err(io::Error::last_os_error().into());
    }
    Ok(unsafe { (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1])) })
}
pub fn peer(fd: RawFd) -> Result<libc::ucred> {
    let mut credentials = mem::MaybeUninit::<libc::ucred>::uninit();
    let mut len = mem::size_of::<libc::ucred>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            credentials.as_mut_ptr().cast(),
            &mut len,
        )
    } != 0
        || len as usize != mem::size_of::<libc::ucred>()
    {
        return Err(fail("PEERCRED_UNAVAILABLE"));
    }
    Ok(unsafe { credentials.assume_init() })
}
pub fn send<T: Serialize>(socket: RawFd, value: &T, fds: &[RawFd]) -> Result<()> {
    if fds.len() > 2 {
        return Err(fail("FD_BOUND"));
    }
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > 1024 {
        return Err(fail("PACKET_BOUND"));
    }
    let mut iov = libc::iovec {
        iov_base: bytes.as_ptr().cast_mut().cast(),
        iov_len: bytes.len(),
    };
    let mut control = [0usize; 8];
    let mut header: libc::msghdr = unsafe { mem::zeroed() };
    header.msg_iov = &mut iov;
    header.msg_iovlen = 1;
    if !fds.is_empty() {
        unsafe {
            header.msg_control = control.as_mut_ptr().cast();
            header.msg_controllen = libc::CMSG_SPACE(mem::size_of_val(fds) as u32) as usize;
            let cmsg = libc::CMSG_FIRSTHDR(&header);
            (*cmsg).cmsg_level = libc::SOL_SOCKET;
            (*cmsg).cmsg_type = libc::SCM_RIGHTS;
            (*cmsg).cmsg_len = libc::CMSG_LEN(mem::size_of_val(fds) as u32) as usize;
            std::ptr::copy_nonoverlapping(
                fds.as_ptr().cast::<u8>(),
                libc::CMSG_DATA(cmsg),
                mem::size_of_val(fds),
            );
        }
    }
    if unsafe { libc::sendmsg(socket, &header, libc::MSG_NOSIGNAL | libc::MSG_DONTWAIT) }
        != bytes.len() as isize
    {
        return Err(fail("INTERNAL_SEND_FAILED"));
    }
    Ok(())
}
pub fn receive<T: DeserializeOwned>(
    socket: RawFd,
    expected_fds: usize,
) -> Result<Option<(T, Vec<OwnedFd>)>> {
    let mut bytes = [0u8; 1024];
    let mut control = [0usize; 8];
    let mut iov = libc::iovec {
        iov_base: bytes.as_mut_ptr().cast(),
        iov_len: bytes.len(),
    };
    let mut header: libc::msghdr = unsafe { mem::zeroed() };
    header.msg_iov = &mut iov;
    header.msg_iovlen = 1;
    header.msg_control = control.as_mut_ptr().cast();
    header.msg_controllen = mem::size_of_val(&control);
    let n = unsafe {
        libc::recvmsg(
            socket,
            &mut header,
            libc::MSG_DONTWAIT | libc::MSG_CMSG_CLOEXEC,
        )
    };
    if n < 0 {
        let e = io::Error::last_os_error();
        if e.kind() == io::ErrorKind::WouldBlock {
            return Ok(None);
        }
        return Err(e.into());
    }
    let mut descriptors = Vec::new();
    let mut invalid = false;
    unsafe {
        let mut cmsg = libc::CMSG_FIRSTHDR(&header);
        while !cmsg.is_null() {
            if (*cmsg).cmsg_level != libc::SOL_SOCKET
                || (*cmsg).cmsg_type != libc::SCM_RIGHTS
                || (*cmsg).cmsg_len < libc::CMSG_LEN(0) as usize
            {
                invalid = true;
                break;
            }
            let length = (*cmsg).cmsg_len - libc::CMSG_LEN(0) as usize;
            if !length.is_multiple_of(mem::size_of::<RawFd>()) {
                invalid = true;
                break;
            }
            for i in 0..length / mem::size_of::<RawFd>() {
                descriptors.push(OwnedFd::from_raw_fd(std::ptr::read_unaligned(
                    libc::CMSG_DATA(cmsg).cast::<RawFd>().add(i),
                )));
            }
            cmsg = libc::CMSG_NXTHDR(&header, cmsg);
        }
    }
    if n == 0
        || invalid
        || header.msg_flags & (libc::MSG_TRUNC | libc::MSG_CTRUNC) != 0
        || descriptors.len() != expected_fds
    {
        return Err(fail("INTERNAL_PACKET_INVALID"));
    }
    let value = serde_json::from_slice(&bytes[..n as usize])?;
    Ok(Some((value, descriptors)))
}
pub fn wait_receive<T: DeserializeOwned>(
    fd: RawFd,
    count: usize,
    timeout_ms: u64,
) -> Result<(T, Vec<OwnedFd>)> {
    let start = Instant::now();
    loop {
        if let Some(value) = receive(fd, count)? {
            return Ok(value);
        }
        if start.elapsed().as_millis() >= timeout_ms as u128 {
            return Err(fail("INTERNAL_TIMEOUT"));
        }
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
}
pub fn parent_death(expected: u32) -> Result<()> {
    // Must run after setuid: changing credentials clears PDEATHSIG.
    if unsafe { libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) } != 0
        || unsafe { libc::getppid() } as u32 != expected
    {
        return Err(fail("PARENT_DEATH_RACE"));
    }
    Ok(())
}
pub fn no_core() -> Result<()> {
    let limit = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    if unsafe { libc::setrlimit(libc::RLIMIT_CORE, &limit) } != 0
        || unsafe { libc::prctl(libc::PR_SET_DUMPABLE, 0) } != 0
    {
        return Err(fail("CORE_POLICY_FAILED"));
    }
    Ok(())
}
#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Boot {
    pub parent: u32,
    pub worker_uid: u32,
    pub worker_gid: u32,
    pub client_uid: u32,
    pub source_phys: String,
    pub socket_path: String,
}
#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Internal {
    Context {
        context: crate::safety::Context,
    },
    Ready {
        worker_pid: u32,
        virtual_node: String,
    },
    Heartbeat,
    Arm {
        generation: u64,
        lease_until: u64,
    },
    Renew {
        generation: u64,
        lease_until: u64,
    },
    Armed,
    Disarm,
    Stopped {
        reason: String,
    },
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::os::fd::AsRawFd;
    #[test]
    fn real_scm_rights_closes_sender_copy_and_authenticates_peer() {
        let (a, b) = pair().unwrap();
        let (data, other) = pair().unwrap();
        let old = data.as_raw_fd();
        send(a.as_raw_fd(), &Internal::Heartbeat, &[old]).unwrap();
        drop(data);
        assert_eq!(unsafe { libc::fcntl(old, libc::F_GETFD) }, -1);
        let (_, received) = wait_receive::<Internal>(b.as_raw_fd(), 1, 100).unwrap();
        assert_eq!(peer(b.as_raw_fd()).unwrap().uid, unsafe { libc::getuid() });
        send(received[0].as_raw_fd(), &Internal::Heartbeat, &[]).unwrap();
        assert!(receive::<Internal>(other.as_raw_fd(), 0).unwrap().is_some());
        assert_ne!(
            unsafe { libc::fcntl(received[0].as_raw_fd(), libc::F_GETFD) } & libc::FD_CLOEXEC,
            0
        );
    }
    #[test]
    fn unexpected_ancillary_descriptors_are_closed() {
        let (a, b) = pair().unwrap();
        let (data, _) = pair().unwrap();
        send(a.as_raw_fd(), &Internal::Heartbeat, &[data.as_raw_fd()]).unwrap();
        assert!(receive::<Internal>(b.as_raw_fd(), 0).is_err());
    }
}

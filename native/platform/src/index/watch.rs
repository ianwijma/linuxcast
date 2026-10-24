use std::ffi::CString;
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};

pub(super) struct Watcher {
    fd: Option<OwnedFd>,
    pub failed: bool,
}
impl Watcher {
    pub fn new() -> Self {
        // SAFETY: flags only; successful fd is uniquely owned and closed by RAII.
        let fd = unsafe { libc::inotify_init1(libc::IN_NONBLOCK | libc::IN_CLOEXEC) };
        Self {
            fd: if fd < 0 {
                None
            } else {
                Some(unsafe { OwnedFd::from_raw_fd(fd) })
            },
            failed: fd < 0,
        }
    }
    pub fn add(&mut self, directory: i32) -> bool {
        let Some(fd) = self.fd.as_ref() else {
            return false;
        };
        // This /proc descriptor is ours and remains open during registration.
        let path = CString::new(format!("/proc/self/fd/{directory}")).unwrap();
        let mask = libc::IN_CREATE
            | libc::IN_DELETE
            | libc::IN_MOVED_FROM
            | libc::IN_MOVED_TO
            | libc::IN_ATTRIB
            | libc::IN_CLOSE_WRITE
            | libc::IN_DELETE_SELF
            | libc::IN_MOVE_SELF
            | libc::IN_ONLYDIR;
        // SAFETY: NUL-terminated owned path; inotify copies it synchronously.
        let success = unsafe { libc::inotify_add_watch(fd.as_raw_fd(), path.as_ptr(), mask) } >= 0;
        self.failed |= !success;
        success
    }
    pub fn poll(&mut self) -> (bool, bool, bool) {
        let Some(fd) = self.fd.as_ref() else {
            return (true, false, false);
        };
        let mut bytes = [0_u8; 65536];
        let mut dirty = false;
        let mut overflow = false;
        // Bound each poll even when another process continuously changes files.
        for _ in 0..16 {
            // SAFETY: writable byte buffer; fd is live and nonblocking.
            let n = unsafe { libc::read(fd.as_raw_fd(), bytes.as_mut_ptr().cast(), bytes.len()) };
            if n < 0 {
                if io::Error::last_os_error().kind() != io::ErrorKind::WouldBlock {
                    self.failed = true;
                    dirty = true;
                }
                break;
            }
            if n == 0 {
                break;
            }
            dirty = true;
            let mut offset = 0;
            while offset + 16 <= n as usize {
                let mask = u32::from_ne_bytes(bytes[offset + 4..offset + 8].try_into().unwrap());
                let len = u32::from_ne_bytes(bytes[offset + 12..offset + 16].try_into().unwrap())
                    as usize;
                overflow |= mask & libc::IN_Q_OVERFLOW != 0;
                self.failed |= mask & libc::IN_IGNORED != 0;
                offset += 16 + len;
            }
        }
        (dirty, overflow, !self.failed)
    }
}

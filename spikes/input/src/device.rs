use crate::{Result, fail};
use std::{
    ffi::{CStr, CString, c_void},
    os::fd::{AsRawFd, OwnedFd},
    ptr::NonNull,
};
unsafe extern "C" {
    fn lc_policy_probe() -> i32;
    fn lc_silence();
    fn lc_caps_empty() -> i32;
    fn lc_supervisor_caps() -> i32;
    fn lc_worker_policy() -> i32;
    fn lc_validate(fd: i32, phys: *const i8) -> i32;
    fn lc_prepare(input: i32, output: i32) -> *mut c_void;
    fn lc_node(d: *mut c_void) -> *const i8;
    fn lc_all_released(d: *mut c_void) -> i32;
    fn lc_grab(d: *mut c_void) -> i32;
    fn lc_next(d: *mut c_void, event: *mut libc::input_event) -> i32;
    fn lc_forward(d: *mut c_void, event: *const libc::input_event) -> i32;
    fn lc_destroy(d: *mut c_void);
    fn lc_synthetic(fd: i32, phys: *const i8) -> *mut c_void;
    fn lc_synthetic_node(d: *mut c_void) -> *const i8;
    fn lc_emit(d: *mut c_void, code: u32, value: i32) -> i32;
    fn lc_synthetic_destroy(d: *mut c_void);
    fn lc_regrab(fd: i32) -> i32;
    fn lc_key_down(fd: i32, key: u32) -> i32;
    fn lc_removed(fd: i32) -> i32;
}
pub fn silence() {
    unsafe { lc_silence() }
}
pub fn policy_probe() -> bool {
    unsafe { lc_policy_probe() == 1 }
}
pub fn empty_caps() -> bool {
    unsafe { lc_caps_empty() == 1 }
}
pub fn supervisor_caps() -> Result<()> {
    if unsafe { lc_supervisor_caps() } != 0 {
        Err(fail("SUPERVISOR_CAPS_FAILED"))
    } else {
        Ok(())
    }
}
pub fn worker_policy() -> Result<()> {
    if unsafe { lc_worker_policy() } != 0 {
        Err(fail("WORKER_POLICY_FAILED"))
    } else {
        Ok(())
    }
}
pub fn validate(fd: &OwnedFd, phys: &str) -> Result<()> {
    let p = CString::new(phys)?;
    if unsafe { lc_validate(fd.as_raw_fd(), p.as_ptr()) } != 0 {
        Err(fail("NOT_MANUFACTURED_LAB_DEVICE"))
    } else {
        Ok(())
    }
}
pub fn regrab(fd: &OwnedFd) -> bool {
    unsafe { lc_regrab(fd.as_raw_fd()) == 0 }
}
pub fn key_down(fd: &OwnedFd, key: u32) -> bool {
    unsafe { lc_key_down(fd.as_raw_fd(), key) == 1 }
}
pub fn removed(fd: &OwnedFd) -> bool {
    unsafe { lc_removed(fd.as_raw_fd()) == 1 }
}
pub struct Device {
    native: NonNull<c_void>,
    _input: OwnedFd,
    _output: OwnedFd,
}
impl Device {
    pub fn new(input: OwnedFd, output: OwnedFd) -> Result<Self> {
        let native = NonNull::new(unsafe { lc_prepare(input.as_raw_fd(), output.as_raw_fd()) })
            .ok_or_else(|| fail("VIRTUAL_DEVICE_UNAVAILABLE"))?;
        Ok(Self {
            native,
            _input: input,
            _output: output,
        })
    }
    pub fn node(&self) -> Result<String> {
        let p = unsafe { lc_node(self.native.as_ptr()) };
        if p.is_null() {
            return Err(fail("NO_VIRTUAL_NODE"));
        }
        Ok(unsafe { CStr::from_ptr(p) }.to_str()?.to_owned())
    }
    pub fn all_released(&self) -> bool {
        unsafe { lc_all_released(self.native.as_ptr()) == 1 }
    }
    pub fn grab(&self) -> Result<()> {
        if unsafe { lc_grab(self.native.as_ptr()) } != 0 {
            Err(fail("HELD_OR_COMPETING_GRAB"))
        } else {
            Ok(())
        }
    }
    /// Discard all pre-arm events in both libevdev and kernel buffers. Reaching
    /// EAGAIN is the barrier; held state alone cannot detect completed typing.
    /// A flood, SYN_DROPPED or read error is ambiguous and refuses arming.
    pub fn discard_backlog(&self) -> Result<()> {
        for _ in 0..256 {
            if self.next()?.is_none() {
                return Ok(());
            }
        }
        Err(fail("PREARM_BACKLOG_BOUND"))
    }
    pub fn next(&self) -> Result<Option<libc::input_event>> {
        let mut event = std::mem::MaybeUninit::uninit();
        let rc = unsafe { lc_next(self.native.as_ptr(), event.as_mut_ptr()) };
        if rc == -libc::EAGAIN {
            return Ok(None);
        }
        if rc == 1 {
            return Err(fail("SYN_DROPPED_DISARM"));
        }
        if rc < 0 {
            return Err(fail("DEVICE_READ_FAILED"));
        }
        Ok(Some(unsafe { event.assume_init() }))
    }
    pub fn forward(&self, event: &libc::input_event) -> Result<()> {
        if unsafe { lc_forward(self.native.as_ptr(), event) } < 0 {
            Err(fail("FORWARD_FAILED"))
        } else {
            Ok(())
        }
    }
}

/// Synthetic observer only. Raw events never leave this local helper or logs.
pub fn synthetic_key_events(fd: &OwnedFd) -> Result<usize> {
    let mut total = 0;
    for _ in 0..4 {
        let mut events: [libc::input_event; 64] = unsafe { std::mem::zeroed() };
        let n = unsafe {
            libc::read(
                fd.as_raw_fd(),
                events.as_mut_ptr().cast(),
                std::mem::size_of_val(&events),
            )
        };
        if n < 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::WouldBlock {
                return Ok(total);
            }
            return Err(fail("SYNTHETIC_OBSERVER_READ_FAILED"));
        }
        if n == 0 || !(n as usize).is_multiple_of(std::mem::size_of::<libc::input_event>()) {
            return Err(fail("SYNTHETIC_OBSERVER_FRAME_FAILED"));
        }
        total += events[..n as usize / std::mem::size_of::<libc::input_event>()]
            .iter()
            .filter(|e| e.type_ == 1)
            .count();
    }
    Err(fail("SYNTHETIC_OBSERVER_BOUND"))
}
impl Drop for Device {
    fn drop(&mut self) {
        unsafe { lc_destroy(self.native.as_ptr()) }
    }
}
pub struct Synthetic {
    native: NonNull<c_void>,
    _fd: OwnedFd,
}
impl Synthetic {
    pub fn new(fd: OwnedFd, phys: &str) -> Result<Self> {
        let p = CString::new(phys)?;
        let native = NonNull::new(unsafe { lc_synthetic(fd.as_raw_fd(), p.as_ptr()) })
            .ok_or_else(|| fail("SYNTHETIC_UNAVAILABLE"))?;
        Ok(Self { native, _fd: fd })
    }
    pub fn node(&self) -> Result<String> {
        let p = unsafe { lc_synthetic_node(self.native.as_ptr()) };
        if p.is_null() {
            return Err(fail("NO_SOURCE_NODE"));
        }
        Ok(unsafe { CStr::from_ptr(p) }.to_str()?.into())
    }
    pub fn emit(&self, code: u32, value: i32) -> Result<()> {
        if unsafe { lc_emit(self.native.as_ptr(), code, value) } < 0 {
            Err(fail("SYNTHETIC_EMIT_FAILED"))
        } else {
            Ok(())
        }
    }
}
impl Drop for Synthetic {
    fn drop(&mut self) {
        unsafe { lc_synthetic_destroy(self.native.as_ptr()) }
    }
}

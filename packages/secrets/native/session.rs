//! Read-only Linux/logind credential-session observation. Dedicated stdio helper
//! process only: owns SIGTERM/SIGINT handlers and stdin/stdout until it returns.
//! No credentials or caller-supplied identity enter this module.
#[cfg(not(all(target_os = "linux", target_arch = "x86_64")))]
compile_error!("credential-session requires Linux amd64");
use std::collections::BTreeSet;
use std::ffi::{CStr, CString, c_char, c_int, c_long, c_void};
use std::fs::File;
use std::io::Read;
use std::os::fd::{AsRawFd, FromRawFd};
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

type P = *mut c_void;
const BUS: &CStr = c"org.freedesktop.DBus";
const BUS_PATH: &CStr = c"/org/freedesktop/DBus";
const LOGIN: &CStr = c"org.freedesktop.login1";
const MANAGER: &CStr = c"org.freedesktop.login1.Manager";
const MANAGER_PATH: &CStr = c"/org/freedesktop/login1";
const SESSION: &CStr = c"org.freedesktop.login1.Session";
const PROPERTIES: &CStr = c"org.freedesktop.DBus.Properties";
const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;
const BUDGET: Duration = Duration::from_millis(700);
// Start the next refresh early enough to leave its entire bounded call budget
// within the 1000ms heartbeat ceiling (150 + 700 + 100ms output + margin).
const REFRESH_WAIT: Duration = Duration::from_millis(150);
static SIGNALLED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Failure {
    Unavailable,
    Denied,
    InvalidSession,
    InvalidResponse,
    PeerChanged,
    TransportLost,
}
impl Failure {
    fn wire(self) -> &'static str {
        match self {
            Self::Unavailable => "unavailable",
            Self::Denied => "denied",
            Self::InvalidSession => "invalid-session",
            Self::InvalidResponse => "invalid-response",
            Self::PeerChanged => "peer-changed",
            Self::TransportLost => "transport-lost",
        }
    }
}
type Result<T> = std::result::Result<T, Failure>;

#[repr(C)]
struct PollFd {
    fd: c_int,
    events: i16,
    revents: i16,
}
type SignalCallback =
    unsafe extern "C" fn(P, *const c_char, *const c_char, *const c_char, *const c_char, P, P);
#[link(name = "gio-2.0")]
unsafe extern "C" {
    fn g_dbus_address_get_for_bus_sync(kind: c_int, cancel: P, error: *mut P) -> *mut c_char;
    fn g_dbus_connection_new_for_address_sync(
        address: *const c_char,
        flags: c_int,
        auth: P,
        cancel: P,
        error: *mut P,
    ) -> P;
    fn g_dbus_connection_set_exit_on_close(connection: P, exit: c_int);
    fn g_dbus_connection_is_closed(connection: P) -> c_int;
    fn g_dbus_connection_call_sync(
        connection: P,
        peer: *const c_char,
        path: *const c_char,
        interface: *const c_char,
        method: *const c_char,
        params: P,
        reply_type: *const c_char,
        flags: c_int,
        timeout: c_int,
        cancel: P,
        error: *mut P,
    ) -> P;
    fn g_dbus_connection_signal_subscribe(
        connection: P,
        sender: *const c_char,
        interface: *const c_char,
        member: *const c_char,
        path: *const c_char,
        arg0: *const c_char,
        flags: c_int,
        callback: SignalCallback,
        data: P,
        destroy: unsafe extern "C" fn(P),
    ) -> u32;
    fn g_dbus_connection_signal_unsubscribe(connection: P, id: u32);
    fn g_dbus_error_get_remote_error(error: P) -> *mut c_char;
    fn g_dbus_is_unique_name(name: *const c_char) -> c_int;
    fn g_cancellable_new() -> P;
    fn g_cancellable_cancel(cancel: P);
}
#[link(name = "gobject-2.0")]
unsafe extern "C" {
    fn g_object_unref(object: P);
}
#[link(name = "glib-2.0")]
unsafe extern "C" {
    fn g_free(memory: P);
    fn g_error_free(error: P);
    fn g_variant_unref(value: P);
    fn g_variant_new(format: *const c_char, ...) -> P;
    fn g_variant_get_child_value(value: P, index: usize) -> P;
    fn g_variant_get_variant(value: P) -> P;
    fn g_variant_get_string(value: P, length: *mut usize) -> *const c_char;
    fn g_variant_get_uint32(value: P) -> u32;
    fn g_variant_get_boolean(value: P) -> c_int;
    fn g_variant_is_of_type(value: P, kind: *const c_char) -> c_int;
    fn g_variant_n_children(value: P) -> usize;
    fn g_variant_get_size(value: P) -> usize;
    fn g_main_context_new() -> P;
    fn g_main_context_push_thread_default(context: P);
    fn g_main_context_pop_thread_default(context: P);
    fn g_main_context_iteration(context: P, block: c_int) -> c_int;
    fn g_main_context_pending(context: P) -> c_int;
    fn g_main_context_unref(context: P);
}
unsafe extern "C" {
    fn getppid() -> c_int;
    fn getuid() -> u32;
    fn geteuid() -> u32;
    fn syscall(number: c_long, ...) -> c_long;
    fn poll(fds: *mut PollFd, count: usize, timeout: c_int) -> c_int;
    fn read(fd: c_int, buffer: P, size: usize) -> isize;
    fn write(fd: c_int, buffer: *const c_void, size: usize) -> isize;
    fn fcntl(fd: c_int, command: c_int, ...) -> c_int;
    fn signal(number: c_int, handler: usize) -> usize;
}

// Full-transfer GIO/GLib values are always released; borrowed C strings are
// copied only while their owning variant remains alive. No GError is printed.
struct Object(P);
impl Drop for Object {
    fn drop(&mut self) {
        unsafe { g_object_unref(self.0) }
    }
}
struct Variant(P);
impl Drop for Variant {
    fn drop(&mut self) {
        unsafe { g_variant_unref(self.0) }
    }
}
impl Variant {
    fn typed(&self, kind: &CStr) -> Result<()> {
        if unsafe { g_variant_is_of_type(self.0, kind.as_ptr()) } != 0 {
            Ok(())
        } else {
            Err(Failure::InvalidResponse)
        }
    }
    fn child(&self, index: usize) -> Self {
        Self(unsafe { g_variant_get_child_value(self.0, index) })
    }
    fn text(&self, kind: &CStr) -> Result<String> {
        self.typed(kind)?;
        let mut length = 0;
        let p = unsafe { g_variant_get_string(self.0, &mut length) };
        if p.is_null() || length > 512 {
            return Err(Failure::InvalidResponse);
        }
        unsafe { CStr::from_ptr(p) }
            .to_str()
            .map(str::to_owned)
            .map_err(|_| Failure::InvalidResponse)
    }
    fn boolean(&self) -> Result<bool> {
        self.typed(c"b")?;
        Ok(unsafe { g_variant_get_boolean(self.0) } != 0)
    }
    fn uint(&self) -> Result<u32> {
        self.typed(c"u")?;
        Ok(unsafe { g_variant_get_uint32(self.0) })
    }
}
fn take_error(error: P) -> Failure {
    if error.is_null() {
        return Failure::Unavailable;
    }
    unsafe {
        let name = g_dbus_error_get_remote_error(error);
        let failure = if name.is_null() {
            Failure::Unavailable
        } else {
            match CStr::from_ptr(name).to_bytes() {
                b"org.freedesktop.DBus.Error.AccessDenied"
                | b"org.freedesktop.DBus.Error.AuthFailed" => Failure::Denied,
                b"org.freedesktop.DBus.Error.InvalidArgs" => Failure::InvalidResponse,
                b"org.freedesktop.login1.NoSessionForPID"
                | b"org.freedesktop.DBus.Error.UnknownObject" => Failure::InvalidSession,
                _ => Failure::Unavailable,
            }
        };
        g_free(name.cast());
        g_error_free(error);
        failure
    }
}

// Linux amd64 pidfd_open; no signal or operation is ever sent through the fd.
// An exited parent's pinned lifetime cannot be confused with PID reuse.
struct Parent {
    pid: c_int,
    uid: u32,
    start: u64,
    fd: File,
}
fn proc_text(pid: c_int, name: &str) -> Result<String> {
    let mut text = String::new();
    File::open(format!("/proc/{pid}/{name}"))
        .map_err(|_| Failure::InvalidSession)?
        .take(16_385)
        .read_to_string(&mut text)
        .map_err(|_| Failure::InvalidSession)?;
    if text.len() > 16_384 {
        return Err(Failure::InvalidSession);
    }
    Ok(text)
}
fn proc_identity(pid: c_int, uid: u32) -> Result<u64> {
    let status = proc_text(pid, "status")?;
    let ids = status
        .lines()
        .find_map(|l| l.strip_prefix("Uid:"))
        .ok_or(Failure::InvalidSession)?;
    let ids: Vec<_> = ids.split_whitespace().collect();
    if ids.len() != 4 || ids.iter().any(|v| v.parse::<u32>() != Ok(uid)) {
        return Err(Failure::InvalidSession);
    }
    let stat = proc_text(pid, "stat")?;
    // comm can contain ')' and spaces; only fields after its final ')' are numeric.
    stat.rsplit_once(')')
        .and_then(|(_, tail)| tail.split_whitespace().nth(19))
        .and_then(|v| v.parse().ok())
        .ok_or(Failure::InvalidSession)
}
fn ready(fd: c_int) -> bool {
    let mut p = PollFd {
        fd,
        events: 1,
        revents: 0,
    };
    unsafe { poll(&mut p, 1, 0) != 0 }
}
impl Parent {
    fn capture() -> Result<Self> {
        let pid = unsafe { getppid() };
        let uid = unsafe { getuid() };
        if pid <= 1 || uid != unsafe { geteuid() } {
            return Err(Failure::InvalidSession);
        }
        let fd = unsafe { syscall(434, pid, 0u32) };
        if fd < 0 {
            return Err(Failure::Unavailable);
        }
        let fd = unsafe { File::from_raw_fd(fd as c_int) };
        let parent = Self {
            pid,
            uid,
            start: proc_identity(pid, uid)?,
            fd,
        };
        parent.verify()?;
        Ok(parent)
    }
    fn verify(&self) -> Result<()> {
        if unsafe { getppid() } != self.pid
            || unsafe { getuid() } != self.uid
            || unsafe { geteuid() } != self.uid
            || ready(self.fd.as_raw_fd())
            || proc_identity(self.pid, self.uid)? != self.start
            || ready(self.fd.as_raw_fd())
        {
            return Err(Failure::InvalidSession);
        }
        Ok(())
    }
}

// GCancellable is explicitly thread-safe. The supervisor only cancels it and
// polls lifecycle fds; every connection/context/callback stays on the main thread.
struct Cancel(Object);
unsafe impl Send for Cancel {}
unsafe impl Sync for Cancel {}
struct Control {
    cancel: Cancel,
    done: AtomicBool,
    stop: AtomicU8,
    operation: Mutex<Option<Instant>>,
}
impl Control {
    fn check(&self) -> Result<()> {
        if SIGNALLED.load(Ordering::SeqCst)
            || self
                .operation
                .lock()
                .unwrap()
                .is_some_and(|start| start.elapsed() >= BUDGET)
        {
            return Err(Failure::Unavailable);
        }
        match self.stop.load(Ordering::SeqCst) {
            0 => Ok(()),
            2 => Err(Failure::InvalidResponse),
            3 => Err(Failure::InvalidSession),
            _ => Err(Failure::Unavailable),
        }
    }
    fn stop(&self, reason: u8) {
        let _ = self
            .stop
            .compare_exchange(0, reason, Ordering::SeqCst, Ordering::SeqCst);
        unsafe { g_cancellable_cancel(self.cancel.0.0) }
    }
}
unsafe extern "C" fn terminate(_: c_int) {
    SIGNALLED.store(true, Ordering::SeqCst);
}
struct Signals {
    term: usize,
    interrupt: usize,
}
impl Signals {
    fn install() -> Result<Self> {
        SIGNALLED.store(false, Ordering::SeqCst);
        let term = unsafe { signal(15, terminate as *const () as usize) };
        if term == usize::MAX {
            return Err(Failure::Unavailable);
        }
        let interrupt = unsafe { signal(2, terminate as *const () as usize) };
        if interrupt == usize::MAX {
            unsafe {
                signal(15, term);
            }
            return Err(Failure::Unavailable);
        }
        Ok(Self { term, interrupt })
    }
}
impl Drop for Signals {
    fn drop(&mut self) {
        unsafe {
            signal(15, self.term);
            signal(2, self.interrupt);
        }
    }
}
struct Supervisor {
    control: Arc<Control>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Supervisor {
    fn new(parent: Arc<Parent>) -> Result<Self> {
        let control = Arc::new(Control {
            cancel: Cancel(Object(unsafe { g_cancellable_new() })),
            done: AtomicBool::new(false),
            stop: AtomicU8::new(0),
            operation: Mutex::new(None),
        });
        let c = control.clone();
        let thread = std::thread::Builder::new()
            .name("session-lifecycle".into())
            .spawn(move || {
                while !c.done.load(Ordering::SeqCst) {
                    if SIGNALLED.load(Ordering::SeqCst) {
                        c.stop(1);
                        break;
                    }
                    if ready(parent.fd.as_raw_fd()) || unsafe { getppid() } != parent.pid {
                        c.stop(3);
                        break;
                    }
                    let mut p = PollFd {
                        fd: 0,
                        events: 1,
                        revents: 0,
                    };
                    let rc = unsafe { poll(&mut p, 1, 10) };
                    if rc > 0 {
                        let mut byte = 0u8;
                        let n = unsafe { read(0, (&mut byte as *mut u8).cast(), 1) };
                        c.stop(if n == 0 { 1 } else { 2 });
                        break;
                    }
                    if rc < 0 && std::io::Error::last_os_error().raw_os_error() != Some(4) {
                        c.stop(1);
                        break;
                    }
                    if c.operation
                        .lock()
                        .unwrap()
                        .is_some_and(|start| start.elapsed() >= BUDGET)
                    {
                        c.stop(4);
                        break;
                    }
                }
            })
            .map_err(|_| Failure::Unavailable)?;
        Ok(Self {
            control,
            thread: Some(thread),
        })
    }
}
impl Drop for Supervisor {
    fn drop(&mut self) {
        self.control.done.store(true, Ordering::SeqCst);
        unsafe { g_cancellable_cancel(self.control.cancel.0.0) }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[derive(Default)]
struct Events {
    epoch: AtomicU64,
    terminal: AtomicU8,
}
struct CallbackData {
    events: Arc<Events>,
    session: Option<CString>,
    kind: u8,
}
unsafe extern "C" fn destroy_callback(data: P) {
    drop(unsafe { Box::from_raw(data.cast::<CallbackData>()) });
}
unsafe extern "C" fn on_signal(
    _: P,
    _: *const c_char,
    _: *const c_char,
    _: *const c_char,
    _: *const c_char,
    params: P,
    data: P,
) {
    let data = unsafe { &*data.cast::<CallbackData>() };
    // Borrowed callback parameters are valid for this invocation only.
    let kind = match data.kind {
        1 => c"(sss)",
        2 => c"(sa{sv}as)",
        3 => c"(so)",
        _ => c"(b)",
    };
    let valid = unsafe {
        g_variant_is_of_type(params, kind.as_ptr()) != 0 && g_variant_get_size(params) <= 65_536
    };
    let terminal = if !valid {
        2
    } else if data.kind == 1 {
        1
    } else if data.kind == 4 {
        3
    } else if data.kind == 3 {
        let path = Variant(unsafe { g_variant_get_child_value(params, 1) });
        if path.text(c"o").ok().as_deref() == data.session.as_ref().and_then(|s| s.to_str().ok()) {
            3
        } else {
            0
        }
    } else {
        0
    };
    if terminal != 0 {
        let _ =
            data.events
                .terminal
                .compare_exchange(0, terminal, Ordering::SeqCst, Ordering::SeqCst);
    }
    data.events.epoch.fetch_add(1, Ordering::SeqCst);
}

struct Context(P);
impl Context {
    fn new() -> Self {
        unsafe {
            let p = g_main_context_new();
            g_main_context_push_thread_default(p);
            Self(p)
        }
    }
    fn drain(&self) -> Result<()> {
        // Bound work under a malicious/flooded peer instead of delaying expiry.
        for _ in 0..256 {
            if unsafe { g_main_context_pending(self.0) } == 0 {
                return Ok(());
            }
            unsafe {
                g_main_context_iteration(self.0, 0);
            }
        }
        Err(Failure::InvalidResponse)
    }
}
impl Drop for Context {
    fn drop(&mut self) {
        let _ = self.drain();
        unsafe {
            g_main_context_pop_thread_default(self.0);
            g_main_context_unref(self.0);
        }
    }
}
struct Connection {
    object: Object,
    subscriptions: Vec<u32>,
}
fn local_bus_address(address: &CStr) -> bool {
    let bytes = address.to_bytes();
    bytes.len() <= 2048
        && !bytes.contains(&b';')
        && (bytes.starts_with(b"unix:path=/") || bytes.starts_with(b"unix:abstract="))
}
impl Drop for Connection {
    fn drop(&mut self) {
        // Same thread as subscribe: GIO guarantees no callbacks after unsubscribe.
        // Box lifetime is separately retained until GIO calls destroy_callback.
        for id in self.subscriptions.drain(..) {
            unsafe { g_dbus_connection_signal_unsubscribe(self.object.0, id) }
        }
    }
}
impl Connection {
    fn open(control: &Control) -> Result<Self> {
        let mut error = ptr::null_mut();
        let address = unsafe { g_dbus_address_get_for_bus_sync(1, control.cancel.0.0, &mut error) };
        if address.is_null() {
            return Err(take_error(error));
        }
        // A hostile inherited address must not turn this read-only local adapter
        // into a TCP/nonce-TCP/autolaunch client or a fallback endpoint scanner.
        if !local_bus_address(unsafe { CStr::from_ptr(address) }) {
            unsafe { g_free(address.cast()) }
            return Err(Failure::Unavailable);
        }
        let object = unsafe {
            g_dbus_connection_new_for_address_sync(
                address,
                1 | 8,
                ptr::null_mut(),
                control.cancel.0.0,
                &mut error,
            )
        };
        unsafe { g_free(address.cast()) }
        if object.is_null() {
            return Err(take_error(error));
        }
        unsafe {
            g_dbus_connection_set_exit_on_close(object, 0);
        }
        Ok(Self {
            object: Object(object),
            subscriptions: Vec::new(),
        })
    }
    // Keep the fixed GIO call identity/type/deadline fields explicit at each use.
    #[allow(clippy::too_many_arguments)]
    fn call(
        &self,
        c: &Control,
        peer: &CStr,
        path: &CStr,
        interface: &CStr,
        method: &CStr,
        params: P,
        reply: &CStr,
    ) -> Result<Variant> {
        // params are floating GVariants consumed by call_sync even on failure.
        // Do not return before that consumption; use a minimal timeout if stopped.
        let remaining = c
            .operation
            .lock()
            .unwrap()
            .map(|s| BUDGET.saturating_sub(s.elapsed()).as_millis())
            .unwrap_or(0);
        let timeout = remaining.clamp(1, 700) as c_int;
        let mut error = ptr::null_mut();
        let value = unsafe {
            g_dbus_connection_call_sync(
                self.object.0,
                peer.as_ptr(),
                path.as_ptr(),
                interface.as_ptr(),
                method.as_ptr(),
                params,
                reply.as_ptr(),
                1,
                timeout,
                c.cancel.0.0,
                &mut error,
            )
        };
        if value.is_null() {
            let failure = take_error(error);
            if unsafe { g_dbus_connection_is_closed(self.object.0) } != 0 {
                return Err(Failure::TransportLost);
            }
            return Err(failure);
        }
        let value = Variant(value);
        c.check()?;
        if remaining == 0 {
            return Err(Failure::Unavailable);
        }
        Ok(value)
    }
    fn subscribe(
        &mut self,
        sender: &CStr,
        interface: &CStr,
        member: &CStr,
        path: &CStr,
        arg0: Option<&CStr>,
        data: CallbackData,
    ) {
        let id = unsafe {
            g_dbus_connection_signal_subscribe(
                self.object.0,
                sender.as_ptr(),
                interface.as_ptr(),
                member.as_ptr(),
                path.as_ptr(),
                arg0.map_or(ptr::null(), CStr::as_ptr),
                0,
                on_signal,
                Box::into_raw(Box::new(data)).cast(),
                destroy_callback,
            )
        };
        self.subscriptions.push(id);
    }
    fn owner(&self, c: &Control) -> Result<CString> {
        let value = self.call(
            c,
            BUS,
            BUS_PATH,
            BUS,
            c"GetNameOwner",
            unsafe { g_variant_new(c"(s)".as_ptr(), LOGIN.as_ptr()) },
            c"(s)",
        )?;
        let name = value.child(0).text(c"s")?;
        let name = CString::new(name).map_err(|_| Failure::InvalidResponse)?;
        if name.as_bytes().len() > 128 || unsafe { g_dbus_is_unique_name(name.as_ptr()) } == 0 {
            return Err(Failure::InvalidResponse);
        }
        Ok(name)
    }
    fn attest(&self, c: &Control, peer: &CStr) -> Result<()> {
        if self.owner(c)?.as_c_str() != peer {
            return Err(Failure::PeerChanged);
        }
        let value = self.call(
            c,
            BUS,
            BUS_PATH,
            BUS,
            c"GetConnectionUnixUser",
            unsafe { g_variant_new(c"(s)".as_ptr(), peer.as_ptr()) },
            c"(u)",
        )?;
        if value.child(0).uint()? != 0 {
            return Err(Failure::Denied);
        }
        Ok(())
    }
    fn session(&self, c: &Control, peer: &CStr, pid: c_int) -> Result<CString> {
        let value = self.call(
            c,
            peer,
            MANAGER_PATH,
            MANAGER,
            c"GetSessionByPID",
            unsafe { g_variant_new(c"(u)".as_ptr(), pid as u32) },
            c"(o)",
        )?;
        let path = value.child(0).text(c"o")?;
        if !path.starts_with("/org/freedesktop/login1/session/")
            || path.len() <= 32
            || path.len() > 256
        {
            return Err(Failure::InvalidSession);
        }
        CString::new(path).map_err(|_| Failure::InvalidResponse)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Observation {
    active: bool,
    locked: bool,
    local: bool,
    owner: bool,
}
fn properties(value: &Variant, uid: u32) -> Result<Observation> {
    value.typed(c"(a{sv})")?;
    if unsafe { g_variant_get_size(value.0) } > 65_536 {
        return Err(Failure::InvalidResponse);
    }
    let dictionary = value.child(0);
    let count = unsafe { g_variant_n_children(dictionary.0) };
    if count > 128 {
        return Err(Failure::InvalidResponse);
    }
    let mut keys = BTreeSet::new();
    let (mut user, mut class, mut kind, mut active, mut remote, mut locked) =
        (None, None, None, None, None, None);
    for i in 0..count {
        let entry = dictionary.child(i);
        let key = entry.child(0).text(c"s")?;
        if !keys.insert(key.clone()) {
            return Err(Failure::InvalidResponse);
        }
        let wrapper = entry.child(1);
        let v = Variant(unsafe { g_variant_get_variant(wrapper.0) });
        match key.as_str() {
            "User" => {
                v.typed(c"(uo)")?;
                user = Some(v.child(0).uint()?);
            }
            "Class" => class = Some(v.text(c"s")?),
            "Type" => kind = Some(v.text(c"s")?),
            "Active" => active = Some(v.boolean()?),
            "Remote" => remote = Some(v.boolean()?),
            "LockedHint" => locked = Some(v.boolean()?),
            _ => {}
        }
    }
    let (user, class, kind, active, remote, locked) =
        match (user, class, kind, active, remote, locked) {
            (Some(u), Some(c), Some(t), Some(a), Some(r), Some(l)) => (u, c, t, a, r, l),
            _ => return Err(Failure::InvalidResponse),
        };
    if user != uid || class != "user" || !matches!(kind.as_str(), "x11" | "wayland") || remote {
        return Err(Failure::InvalidSession);
    }
    // Inactive and locked are valid denials, never eligible credential admission.
    Ok(Observation {
        active,
        locked,
        local: true,
        owner: true,
    })
}

fn event_check(events: &Events) -> Result<()> {
    match events.terminal.load(Ordering::SeqCst) {
        0 => Ok(()),
        1 => Err(Failure::PeerChanged),
        2 => Err(Failure::InvalidResponse),
        _ => Err(Failure::InvalidSession),
    }
}
fn snapshot(
    connection: &Connection,
    context: &Context,
    events: &Events,
    c: &Control,
    parent: &Parent,
    peer: &CStr,
    session: &CStr,
) -> Result<Observation> {
    loop {
        c.check()?;
        context.drain()?;
        event_check(events)?;
        parent.verify()?;
        let epoch = events.epoch.load(Ordering::SeqCst);
        connection.attest(c, peer)?;
        if connection.session(c, peer, parent.pid)?.as_c_str() != session {
            return Err(Failure::InvalidSession);
        }
        let reply = connection.call(
            c,
            peer,
            session,
            PROPERTIES,
            c"GetAll",
            unsafe { g_variant_new(c"(s)".as_ptr(), SESSION.as_ptr()) },
            c"(a{sv})",
        )?;
        let observed = properties(&reply, parent.uid)?;
        // Recheck identity and ownership after the snapshot, not only at startup.
        if connection.session(c, peer, parent.pid)?.as_c_str() != session {
            return Err(Failure::InvalidSession);
        }
        connection.attest(c, peer)?;
        parent.verify()?;
        context.drain()?;
        event_check(events)?;
        c.check()?;
        if unsafe { g_dbus_connection_is_closed(connection.object.0) } != 0 {
            return Err(Failure::TransportLost);
        }
        if epoch == events.epoch.load(Ordering::SeqCst) {
            return Ok(observed);
        }
        // Signals are invalidations, never updates to cached booleans. Retry all
        // properties within the SAME budget, so reordered signals cannot reopen.
    }
}

struct Output {
    flags: c_int,
    sequence: u64,
}
impl Output {
    fn new() -> Result<Self> {
        let flags = unsafe { fcntl(1, 3) };
        if flags < 0 || unsafe { fcntl(1, 4, flags | 2048) } < 0 {
            return Err(Failure::Unavailable);
        }
        Ok(Self { flags, sequence: 0 })
    }
    fn emit(&mut self, state: std::result::Result<Observation, Failure>) -> Result<()> {
        self.sequence = self
            .sequence
            .checked_add(1)
            .filter(|n| *n <= MAX_SEQUENCE)
            .ok_or(Failure::Unavailable)?;
        let tail = match state {
            Ok(o) => format!(
                "\"state\":\"observed\",\"active\":{},\"lockedHint\":{},\"localGraphical\":{},\"ownerMatches\":{}",
                o.active, o.locked, o.local, o.owner
            ),
            Err(e) => format!("\"state\":\"unavailable\",\"reason\":\"{}\"", e.wire()),
        };
        let line = format!(
            "{{\"schemaVersion\":1,\"sequence\":{},{tail}}}\n",
            self.sequence
        );
        if line.len() > 512 {
            return Err(Failure::InvalidResponse);
        }
        let start = Instant::now();
        let mut offset = 0;
        while offset < line.len() && start.elapsed() < Duration::from_millis(100) {
            let n = unsafe { write(1, line.as_ptr().add(offset).cast(), line.len() - offset) };
            if n > 0 {
                offset += n as usize;
                continue;
            }
            if n == 0 {
                break;
            }
            if !matches!(std::io::Error::last_os_error().raw_os_error(), Some(4 | 11)) {
                break;
            }
            let mut p = PollFd {
                fd: 1,
                events: 4,
                revents: 0,
            };
            unsafe {
                poll(&mut p, 1, 5);
            }
        }
        if offset == line.len() {
            Ok(())
        } else {
            Err(Failure::TransportLost)
        }
    }
}
impl Drop for Output {
    fn drop(&mut self) {
        unsafe {
            fcntl(1, 4, self.flags);
        }
    }
}

fn observe(output: &mut Output) -> Result<()> {
    let _signals = Signals::install()?;
    let parent = Arc::new(Parent::capture()?);
    let supervisor = Supervisor::new(parent.clone())?;
    let c = &supervisor.control;
    *c.operation.lock().unwrap() = Some(Instant::now());
    let context = Context::new();
    let mut connection = Connection::open(c)?;
    let events = Arc::new(Events::default());
    connection.subscribe(
        BUS,
        BUS,
        c"NameOwnerChanged",
        BUS_PATH,
        Some(LOGIN),
        CallbackData {
            events: events.clone(),
            session: None,
            kind: 1,
        },
    );
    let peer = connection.owner(c)?;
    connection.attest(c, &peer)?;
    let session = connection.session(c, &peer, parent.pid)?;
    connection.subscribe(
        &peer,
        PROPERTIES,
        c"PropertiesChanged",
        &session,
        Some(SESSION),
        CallbackData {
            events: events.clone(),
            session: None,
            kind: 2,
        },
    );
    connection.subscribe(
        &peer,
        MANAGER,
        c"SessionRemoved",
        MANAGER_PATH,
        None,
        CallbackData {
            events: events.clone(),
            session: Some(session.clone()),
            kind: 3,
        },
    );
    connection.subscribe(
        &peer,
        MANAGER,
        c"PrepareForSleep",
        MANAGER_PATH,
        None,
        CallbackData {
            events: events.clone(),
            session: None,
            kind: 4,
        },
    );
    loop {
        let result = snapshot(&connection, &context, &events, c, &parent, &peer, &session)?;
        c.check()?;
        output.emit(Ok(result))?;
        *c.operation.lock().unwrap() = None;
        let start = Instant::now();
        let epoch = events.epoch.load(Ordering::SeqCst);
        loop {
            c.check()?;
            parent.verify()?;
            context.drain()?;
            event_check(&events)?;
            if unsafe { g_dbus_connection_is_closed(connection.object.0) } != 0 {
                return Err(Failure::TransportLost);
            }
            if events.epoch.load(Ordering::SeqCst) != epoch || start.elapsed() >= REFRESH_WAIT {
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        *c.operation.lock().unwrap() = Some(Instant::now());
    }
}

/// Fixed credential-session CLI implementation. No command payload or identity
/// arguments. Any unknown/failed observation produces one fixed unavailable frame
/// and exits; recovery requires a new helper/gate generation owned by main.
/// Call only in a dedicated Linux amd64 process with piped stdin/stdout.
#[allow(clippy::result_unit_err)] // Frozen callable API; raw error details stay private.
pub fn run_stdio() -> std::result::Result<(), ()> {
    let mut output = Output::new().map_err(|_| ())?;
    match observe(&mut output) {
        Ok(()) => Ok(()),
        Err(failure) => {
            let _ = output.emit(Err(failure));
            Err(())
        }
    }
}

#[cfg(test)]
#[path = "tests/policy.rs"]
mod tests;

//! Bounded desktop application discovery/launch and explicit HTTP(S) handoff.
//! All Exec interpretation belongs to GIO; URLs are passed as one literal URI.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::ffi::{CStr, CString};
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;

const REQUEST_MAX: u64 = 65_536;
const CATALOGUE_MAX: usize = 10_000;
const URL_MAX: usize = 8192;
type Object = *mut c_void;
#[repr(C)]
struct GList {
    data: Object,
    next: *mut GList,
    prev: *mut GList,
}
#[link(name = "gio-2.0")]
unsafe extern "C" {
    fn g_app_info_get_all() -> *mut GList;
    fn g_app_info_get_default_for_uri_scheme(scheme: *const c_char) -> Object;
    fn g_app_info_supports_uris(info: Object) -> c_int;
    fn g_app_info_get_id(info: Object) -> *const c_char;
    fn g_app_info_get_display_name(info: Object) -> *const c_char;
    fn g_app_info_get_name(info: Object) -> *const c_char;
    fn g_app_info_get_description(info: Object) -> *const c_char;
    fn g_app_info_get_executable(info: Object) -> *const c_char;
    fn g_app_info_get_icon(info: Object) -> Object;
    fn g_icon_to_string(icon: Object) -> *mut c_char;
    fn g_dbus_is_name(name: *const c_char) -> c_int;
    fn g_desktop_app_info_get_boolean(info: Object, key: *const c_char) -> c_int;
    fn g_app_info_get_commandline(info: Object) -> *const c_char;
    fn g_app_info_should_show(info: Object) -> c_int;
    fn g_desktop_app_info_get_type() -> usize;
    fn g_desktop_app_info_new(id: *const c_char) -> Object;
    fn g_desktop_app_info_get_filename(info: Object) -> *const c_char;
    fn g_desktop_app_info_get_is_hidden(info: Object) -> c_int;
    fn g_desktop_app_info_get_string(info: Object, key: *const c_char) -> *mut c_char;
    fn g_desktop_app_info_launch_uris_as_manager_with_fds(
        info: Object,
        uris: *mut GList,
        context: Object,
        flags: c_int,
        setup: Option<unsafe extern "C" fn(Object)>,
        setup_data: Object,
        callback: Option<unsafe extern "C" fn(Object, c_int, Object)>,
        callback_data: Object,
        stdin_fd: c_int,
        stdout_fd: c_int,
        stderr_fd: c_int,
        error: *mut Object,
    ) -> c_int;
    fn g_bus_get_sync(bus: c_int, cancellable: Object, error: *mut Object) -> Object;
    fn g_dbus_connection_flush_sync(
        connection: Object,
        cancellable: Object,
        error: *mut Object,
    ) -> c_int;
}
#[link(name = "gobject-2.0")]
unsafe extern "C" {
    fn g_object_unref(object: Object);
    fn g_type_check_instance_is_a(object: Object, kind: usize) -> c_int;
}
#[link(name = "glib-2.0")]
unsafe extern "C" {
    fn g_free(memory: Object);
    fn g_list_free(list: *mut GList);
    fn g_error_free(error: Object);
    fn g_uri_parse(uri: *const c_char, flags: c_int, error: *mut Object) -> Object;
    fn g_uri_unref(uri: Object);
    fn g_uri_get_scheme(uri: Object) -> *const c_char;
    fn g_uri_get_userinfo(uri: Object) -> *const c_char;
    fn g_uri_get_host(uri: Object) -> *const c_char;
    fn g_uri_get_port(uri: Object) -> c_int;
    fn g_compute_checksum_for_data(kind: c_int, data: *const u8, length: usize) -> *mut c_char;
}
// GIO borrowed getters remain valid while their owning reference lives. Full-transfer
// object/string/error/list results are released exactly once by these local guards.
struct OwnedObject(Object);
impl Drop for OwnedObject {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { g_object_unref(self.0) }
        }
    }
}
struct OwnedString(*mut c_char);
impl Drop for OwnedString {
    fn drop(&mut self) {
        unsafe { g_free(self.0.cast()) }
    }
}
// GUri is reference counted independently of GObject, since GLib 2.66.
struct OwnedUri(Object);
impl Drop for OwnedUri {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { g_uri_unref(self.0) }
        }
    }
}
struct OwnedError(Object);
impl Drop for OwnedError {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { g_error_free(self.0) }
        }
    }
}
struct OwnedList(*mut GList);
impl Drop for OwnedList {
    fn drop(&mut self) {
        unsafe {
            let mut item = self.0;
            while !item.is_null() {
                g_object_unref((*item).data);
                item = (*item).next;
            }
            g_list_free(self.0);
        }
    }
}
fn string(pointer: *const c_char) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    // GIO promises NUL-terminated UTF-8; reject invalid bytes rather than lossy identity.
    unsafe { CStr::from_ptr(pointer).to_str().ok().map(str::to_owned) }
}
fn property(info: Object, key: &str) -> Option<String> {
    let key = CString::new(key).expect("fixed key");
    let value = OwnedString(unsafe { g_desktop_app_info_get_string(info, key.as_ptr()) });
    string(value.0)
}
fn valid_id(id: &str) -> bool {
    id.len() > 8
        && id.len() <= 512
        && id.ends_with(".desktop")
        && !id.chars().any(|c| c.is_control() || c == '/' || c == '\\')
}
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    #[serde(rename = "open-url")]
    OpenUrl {
        #[serde(rename = "protocolVersion")]
        protocol_version: u8,
        url: String,
    },
    List {
        #[serde(rename = "protocolVersion")]
        protocol_version: u8,
        #[serde(rename = "afterId")]
        after_id: Option<String>,
        limit: u16,
    },
    Launch {
        #[serde(rename = "protocolVersion")]
        protocol_version: u8,
        #[serde(rename = "desktopId")]
        desktop_id: String,
        fingerprint: String,
    },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Application {
    desktop_id: String,
    title: String,
    description: String,
    fingerprint: String,
}
fn failure(code: &'static str) -> Value {
    json!({"protocolVersion":1,"ok":false,"error":code})
}
fn metadata(info: Object) -> Option<Application> {
    unsafe {
        if info.is_null()
            || g_type_check_instance_is_a(info, g_desktop_app_info_get_type()) == 0
            || g_app_info_should_show(info) == 0
            || g_desktop_app_info_get_is_hidden(info) != 0
        {
            return None;
        }
        let desktop_id = string(g_app_info_get_id(info))?;
        if !valid_id(&desktop_id) {
            return None;
        }
        let title = string(g_app_info_get_display_name(info))?;
        let description = string(g_app_info_get_description(info)).unwrap_or_default();
        if title.is_empty()
            || title.len() > 256
            || description.len() > 512
            || title.chars().any(char::is_control)
            || description.chars().any(char::is_control)
        {
            return None;
        }
        let executable = string(g_app_info_get_executable(info));
        let commandline = string(g_app_info_get_commandline(info));
        let bus_name = CString::new(desktop_id.strip_suffix(".desktop")?).ok()?;
        let dbus = g_desktop_app_info_get_boolean(info, c"DBusActivatable".as_ptr()) != 0
            && g_dbus_is_name(bus_name.as_ptr()) != 0
            && !desktop_id.starts_with(':');
        if commandline.as_ref().is_none_or(|line| line.is_empty()) && !dbus {
            return None;
        }
        let icon = g_app_info_get_icon(info);
        let icon_text = OwnedString(if icon.is_null() {
            ptr::null_mut()
        } else {
            g_icon_to_string(icon)
        });
        // The GDesktopAppInfo constructor itself checks TryExec and parses Exec
        // with GLib, resolving argv[0]. Do not resolve get_executable again: in
        // GLib2.72 it is a display-only first-word string that retains quotes.
        // A fresh constructor at launch repeats the actual executable check.
        // Include both parsed GIO properties and source keys. Filename/icon/name affect
        // GIO's %k/%i/%c substitutions. No source content is returned to the caller.
        let keys = [
            "Exec",
            "TryExec",
            "Path",
            "Terminal",
            "DBusActivatable",
            "Hidden",
            "NoDisplay",
            "OnlyShowIn",
            "NotShowIn",
            "Name",
            "GenericName",
            "Comment",
            "Icon",
            "StartupNotify",
            "StartupWMClass",
            "X-GNOME-FullName",
            "X-Flatpak",
            "X-GIO-NoFuse",
        ];
        let fields: Vec<_> = keys.iter().map(|key| (*key, property(info, key))).collect();
        if fields
            .iter()
            .any(|(_, value)| value.as_ref().is_some_and(|s| s.len() > 65_536))
        {
            return None;
        }
        let bytes = serde_json::to_vec(&(
            "linuxcast-gio-application-v1",
            &desktop_id,
            &title,
            &description,
            executable,
            string(g_app_info_get_name(info)),
            commandline,
            string(icon_text.0),
            string(g_desktop_app_info_get_filename(info)),
            fields,
        ))
        .ok()?;
        if bytes.len() > 1_048_576 {
            return None;
        }
        let digest = OwnedString(g_compute_checksum_for_data(2, bytes.as_ptr(), bytes.len()));
        Some(Application {
            desktop_id,
            title,
            description,
            fingerprint: string(digest.0)?,
        })
    }
}
fn list(after: Option<String>, limit: u16) -> Value {
    let list = OwnedList(unsafe { g_app_info_get_all() });
    let mut entries = BTreeMap::new();
    let mut item = list.0;
    let mut count = 0;
    while !item.is_null() {
        count += 1;
        if count > CATALOGUE_MAX {
            return failure("catalogue-too-large");
        }
        if let Some(app) = metadata(unsafe { (*item).data }) {
            entries.insert(app.desktop_id.clone(), app);
        }
        item = unsafe { (*item).next };
    }
    let mut entries = entries
        .into_values()
        .filter(|app| after.as_ref().is_none_or(|id| app.desktop_id > *id));
    let applications: Vec<_> = entries.by_ref().take(usize::from(limit)).collect();
    let next = if entries.next().is_some() {
        applications.last().map(|app| app.desktop_id.clone())
    } else {
        None
    };
    json!({"protocolVersion":1,"ok":true,"value":{"applications":applications,"nextCursor":next}})
}
fn launch(id: String, fingerprint: String) -> Value {
    let id = CString::new(id).expect("validated id");
    let app = OwnedObject(unsafe { g_desktop_app_info_new(id.as_ptr()) });
    let Some(current) = metadata(app.0) else {
        return failure("stale-application");
    };
    if current.desktop_id.as_bytes() != id.as_bytes() || current.fingerprint != fingerprint {
        return failure("stale-application");
    }
    dispatch(app.0, ptr::null_mut())
}
/// The trusted main adapter sends URL.href's ASCII wire representation. Reject
/// ambiguous/noncanonical authorities rather than guessing like a browser's input
/// fixer. This validation does not resolve DNS, fetch, or authorize network access.
fn validated_url(url: &str) -> Option<(CString, &'static CStr)> {
    if url.is_empty()
        || url.len() > URL_MAX
        || !url.is_ascii()
        || url
            .bytes()
            .any(|b| b.is_ascii_control() || b.is_ascii_whitespace() || b == b'\\')
    {
        return None;
    }
    let (rest, scheme, default_port) = if let Some(rest) = url.strip_prefix("https://") {
        (rest, c"https", 443)
    } else if let Some(rest) = url.strip_prefix("http://") {
        (rest, c"http", 80)
    } else {
        return None;
    };
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    // URL.href always includes at least '/' after an HTTP(S) authority.
    if authority.is_empty()
        || !rest[authority_end..].starts_with('/')
        || authority.contains(['@', '%'])
    {
        return None;
    }
    let (host, port) = if let Some(ipv6) = authority.strip_prefix('[') {
        let (address, suffix) = ipv6.split_once(']')?;
        address.parse::<std::net::Ipv6Addr>().ok()?;
        // URL.href serializes IPv6 as lowercase hexadecimal, including mapped
        // IPv4 addresses. Rust's Display uses dotted IPv4 for those mapped values.
        if address.bytes().any(|b| b.is_ascii_uppercase() || b == b'.') {
            return None;
        }
        let port = if suffix.is_empty() {
            None
        } else {
            Some(suffix.strip_prefix(':')?)
        };
        (address, port)
    } else {
        let (host, port) = authority
            .split_once(':')
            .map_or((authority, None), |(host, port)| (host, Some(port)));
        // HTTP URL hosts have different rules from DNS labels. Preserve valid
        // ASCII/IDNA host spelling; do not impose DNS label/length restrictions.
        // Encoded hosts and conflicting authority punctuation are not wire data.
        let dns = host.strip_suffix('.').unwrap_or(host);
        if host.is_empty()
            || host
                .bytes()
                .any(|b| b.is_ascii_uppercase() || b"<>[]^|".contains(&b))
        {
            return None;
        }
        let last = dns.rsplit('.').next()?;
        let decimal = !last.is_empty() && last.bytes().all(|b| b.is_ascii_digit());
        let hexadecimal = last.strip_prefix("0x").is_some_and(|digits| {
            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_hexdigit())
        });
        if (decimal || hexadecimal) && host.parse::<std::net::Ipv4Addr>().ok()?.to_string() != host
        {
            return None;
        }
        (host, port)
    };
    let port = match port {
        Some(port) => {
            let parsed = port.parse::<u16>().ok()?;
            if parsed.to_string() != port || parsed == default_port {
                return None;
            }
            i32::from(parsed)
        }
        None => -1,
    };
    let bytes = url.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'%'
            && (index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit())
        {
            return None;
        }
    }
    let wire = CString::new(url).ok()?;
    let mut error = OwnedError(ptr::null_mut());
    // ENCODED retains valid percent escapes (including non-UTF-8 octets) as
    // opaque data. Do not enable PARSE_RELAXED, NON_DNS or scheme normalization.
    let uri = OwnedUri(unsafe { g_uri_parse(wire.as_ptr(), 1 << 3, &mut error.0) });
    if uri.0.is_null()
        || unsafe { !g_uri_get_userinfo(uri.0).is_null() }
        || unsafe { string(g_uri_get_scheme(uri.0)) }.as_deref() != scheme.to_str().ok()
        || unsafe { string(g_uri_get_host(uri.0)) }.as_deref() != Some(host)
        || unsafe { g_uri_get_port(uri.0) } != port
    {
        return None;
    }
    Some((wire, scheme))
}
fn open_url(url: String) -> Value {
    let Some((wire, scheme)) = validated_url(&url) else {
        return failure("invalid-request");
    };
    // Full-transfer reference. Resolve the default on every request and require
    // the desktop implementation whose launch API can isolate standard streams.
    let app = OwnedObject(unsafe { g_app_info_get_default_for_uri_scheme(scheme.as_ptr()) });
    if app.0.is_null()
        || unsafe { g_type_check_instance_is_a(app.0, g_desktop_app_info_get_type()) } == 0
        || unsafe { g_app_info_supports_uris(app.0) } == 0
    {
        return failure("unavailable");
    }
    // Both this node and its CString data are borrowed only for the synchronous
    // call. Do not use OwnedList: it owns GObjects, whereas this list owns nothing.
    let mut uris = GList {
        data: wire.as_ptr().cast_mut().cast(),
        next: ptr::null_mut(),
        prev: ptr::null_mut(),
    };
    dispatch(app.0, &mut uris)
}
fn dispatch(app: Object, uris: *mut GList) -> Value {
    let Ok(null) = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open("/dev/null")
    else {
        return failure("unavailable");
    };
    // Hold the shared connection and synchronously flush after GIO queues activation,
    // so this one-shot process cannot exit with the activation still in its buffer.
    // GIO uses the same session connection and its normal spawn fallback if absent.
    let bus = OwnedObject(unsafe { g_bus_get_sync(2, ptr::null_mut(), ptr::null_mut()) });
    let mut error = OwnedError(ptr::null_mut());
    let success = unsafe {
        g_desktop_app_info_launch_uris_as_manager_with_fds(
            app,
            uris,
            ptr::null_mut(),
            1 << 2,
            None,
            ptr::null_mut(),
            None,
            ptr::null_mut(),
            null.as_raw_fd(),
            null.as_raw_fd(),
            null.as_raw_fd(),
            &mut error.0,
        )
    };
    if success == 0 {
        return failure("launch-failed");
    }
    if !bus.0.is_null()
        && unsafe { g_dbus_connection_flush_sync(bus.0, ptr::null_mut(), ptr::null_mut()) } == 0
    {
        return failure("launch-failed");
    }
    json!({"protocolVersion":1,"ok":true,"value":{"outcome":"dispatched"}})
}
fn respond(bytes: &[u8]) -> Value {
    // Serde Option accepts null; the wire contract permits only absent or string.
    if serde_json::from_slice::<Value>(bytes)
        .ok()
        .is_some_and(|v| v.get("afterId").is_some_and(Value::is_null))
    {
        return failure("invalid-request");
    }
    let Ok(request) = serde_json::from_slice::<Request>(bytes) else {
        return failure("invalid-request");
    };
    match request {
        Request::OpenUrl {
            protocol_version: 1,
            url,
        } => open_url(url),
        Request::List {
            protocol_version: 1,
            after_id,
            limit,
        } if (1..=100).contains(&limit) && after_id.as_ref().is_none_or(|id| valid_id(id)) => {
            list(after_id, limit)
        }
        Request::Launch {
            protocol_version: 1,
            desktop_id,
            fingerprint,
        } if valid_id(&desktop_id)
            && fingerprint.len() == 64
            && fingerprint
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) =>
        {
            launch(desktop_id, fingerprint)
        }
        _ => failure("invalid-request"),
    }
}
/// One request followed by EOF. Main owns the short process deadline and supplies
/// only its reviewed desktop-launch environment, never provider credentials.
pub fn run_stdio() -> std::io::Result<()> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(REQUEST_MAX + 1)
        .read_to_end(&mut bytes)?;
    let line = bytes.strip_suffix(b"\n").unwrap_or(&bytes);
    let response = if bytes.len() > REQUEST_MAX as usize || line.contains(&b'\n') {
        failure("invalid-request")
    } else {
        respond(line)
    };
    let mut output = serde_json::to_vec(&response)?;
    if output.len() >= 1_048_576 {
        output = serde_json::to_vec(&failure("catalogue-too-large"))?;
    }
    output.push(b'\n');
    std::io::stdout().write_all(&output)
}

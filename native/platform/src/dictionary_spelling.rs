//! One-shot, contained Hunspell 1.7 C API worker. No renderer paths or personal dictionary.
use serde::Deserialize;
use serde_json::json;
use std::collections::HashSet;
use std::ffi::CString;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;

const AFF_MAX: usize = 1024 * 1024;
const DIC_MAX: usize = 16 * 1024 * 1024;
const REQUEST_MAX: usize = 4096;
const RESPONSE_MAX: usize = 65_536;
type Failure = &'static str;
type Handle = *mut c_void;
type Create = unsafe extern "C" fn(*const c_char, *const c_char) -> Handle;
type Destroy = unsafe extern "C" fn(Handle);
type Spell = unsafe extern "C" fn(Handle, *const c_char) -> c_int;
type Encoding = unsafe extern "C" fn(Handle) -> *const c_char;
type Suggest = unsafe extern "C" fn(Handle, *mut *mut *mut c_char, *const c_char) -> c_int;
type FreeList = unsafe extern "C" fn(Handle, *mut *mut *mut c_char, c_int);

struct Library {
    library: Handle,
    create: Create,
    destroy: Destroy,
    spell: Spell,
    encoding: Encoding,
    suggest: Suggest,
    free_list: FreeList,
}
impl Library {
    fn load() -> Result<Self, Failure> {
        // Absolute system path; resolve all symbols BEFORE restricting filesystem access.
        // No caller-selected library or symbol, add/remove/save API, or version symbol.
        let library = unsafe {
            libc::dlopen(
                c"/lib/x86_64-linux-gnu/libhunspell-1.7.so.0".as_ptr(),
                libc::RTLD_NOW | libc::RTLD_LOCAL,
            )
        };
        if library.is_null() {
            return Err("unavailable");
        }
        macro_rules! symbol {
            ($name:literal, $kind:ty) => {{
                let pointer = unsafe { libc::dlsym(library, concat!($name, "\0").as_ptr().cast()) };
                if pointer.is_null() {
                    unsafe {
                        libc::dlclose(library);
                    }
                    return Err("unavailable");
                }
                // C API signatures from the fixed 1.7 header, pointer lives with this Library.
                unsafe { std::mem::transmute::<*mut c_void, $kind>(pointer) }
            }};
        }
        Ok(Self {
            library,
            create: symbol!("Hunspell_create", Create),
            destroy: symbol!("Hunspell_destroy", Destroy),
            spell: symbol!("Hunspell_spell", Spell),
            encoding: symbol!("Hunspell_get_dic_encoding", Encoding),
            suggest: symbol!("Hunspell_suggest", Suggest),
            free_list: symbol!("Hunspell_free_list", FreeList),
        })
    }
}
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            libc::dlclose(self.library);
        }
    }
}
struct Dictionary<'a> {
    handle: Handle,
    library: &'a Library,
}
impl Drop for Dictionary<'_> {
    fn drop(&mut self) {
        unsafe {
            (self.library.destroy)(self.handle);
        }
    }
}
struct Suggestions<'a> {
    values: *mut *mut c_char,
    count: c_int,
    dictionary: &'a Dictionary<'a>,
}
impl Drop for Suggestions<'_> {
    fn drop(&mut self) {
        if !self.values.is_null() {
            unsafe {
                (self.dictionary.library.free_list)(
                    self.dictionary.handle,
                    &mut self.values,
                    self.count,
                );
            }
        }
    }
}

fn stat(fd: c_int) -> Result<libc::stat, Failure> {
    let mut value = unsafe { std::mem::zeroed::<libc::stat>() };
    if unsafe { libc::fstat(fd, &mut value) } != 0 {
        return Err("malformed");
    }
    Ok(value)
}
fn same(a: &libc::stat, b: &libc::stat) -> bool {
    (
        a.st_dev,
        a.st_ino,
        a.st_mode,
        a.st_size,
        a.st_mtime,
        a.st_mtime_nsec,
        a.st_ctime,
        a.st_ctime_nsec,
    ) == (
        b.st_dev,
        b.st_ino,
        b.st_mode,
        b.st_size,
        b.st_mtime,
        b.st_mtime_nsec,
        b.st_ctime,
        b.st_ctime_nsec,
    )
}
fn sealed(bytes: &[u8]) -> Result<OwnedFd, Failure> {
    let raw = unsafe {
        libc::memfd_create(
            c"linuxcast-spelling".as_ptr(),
            libc::MFD_CLOEXEC | libc::MFD_ALLOW_SEALING,
        )
    };
    if raw < 0 {
        return Err("unavailable");
    }
    let mut file = unsafe { File::from_raw_fd(raw) };
    file.write_all(bytes).map_err(|_| "unavailable")?;
    let seals = libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE;
    if unsafe { libc::fcntl(raw, libc::F_ADD_SEALS, seals) } != 0 {
        return Err("unavailable");
    }
    Ok(file.into())
}
fn copy_source(fd: c_int, maximum: usize) -> Result<(OwnedFd, Vec<u8>), Failure> {
    let before = stat(fd)?;
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if before.st_mode & libc::S_IFMT != libc::S_IFREG
        || before.st_size <= 0
        || before.st_size as u64 > maximum as u64
        || flags < 0
        || flags & libc::O_ACCMODE != libc::O_RDONLY
    {
        return Err("malformed");
    }
    let mut bytes = vec![0; before.st_size as usize];
    let mut position = 0;
    while position < bytes.len() {
        let got = unsafe {
            libc::pread(
                fd,
                bytes[position..].as_mut_ptr().cast(),
                bytes.len() - position,
                position as libc::off_t,
            )
        };
        if got < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
            continue;
        }
        if got <= 0 {
            return Err("changed");
        }
        position += got as usize;
    }
    if !same(&before, &stat(fd)?) {
        return Err("changed");
    }
    Ok((sealed(&bytes)?, bytes))
}
fn validate_sources(aff: &[u8], dic: &[u8]) -> Result<(), Failure> {
    let aff = std::str::from_utf8(aff).map_err(|_| "malformed")?;
    let dic = std::str::from_utf8(dic).map_err(|_| "malformed")?;
    if aff.contains('\0') || dic.contains('\0') {
        return Err("malformed");
    }
    let aff = aff.strip_prefix('\u{feff}').unwrap_or(aff);
    let dic = dic.strip_prefix('\u{feff}').unwrap_or(dic);
    let mut encodings = aff.lines().filter_map(|line| {
        let declaration = line.split_once('#').map_or(line, |(value, _)| value);
        let mut fields = declaration.split_ascii_whitespace();
        if fields.next() == Some("SET") {
            Some(fields.collect::<Vec<_>>())
        } else {
            None
        }
    });
    let encoding = encodings.next().ok_or("malformed")?;
    if encoding.len() != 1 || encodings.next().is_some() {
        return Err("malformed");
    }
    if !encoding[0].eq_ignore_ascii_case("UTF-8") && !encoding[0].eq_ignore_ascii_case("UTF8") {
        return Err("unsupported-encoding");
    }
    let mut lines = dic.lines();
    let header = lines.next().ok_or("malformed")?;
    if header.is_empty()
        || header.len() > 6
        || !header.bytes().all(|b| b.is_ascii_digit())
        || header.len() > 1 && header.starts_with('0')
    {
        return Err("malformed");
    }
    let count = header.parse::<usize>().map_err(|_| "malformed")?;
    if count > 500_000
        || lines.count() != count
        || aff.lines().chain(dic.lines()).any(|line| line.len() > 8192)
    {
        return Err("malformed");
    }
    Ok(())
}
fn limit(resource: libc::__rlimit_resource_t, value: libc::rlim_t) -> Result<(), Failure> {
    let bound = libc::rlimit {
        rlim_cur: value,
        rlim_max: value,
    };
    if unsafe { libc::setrlimit(resource, &bound) } != 0 {
        return Err("unavailable");
    }
    Ok(())
}
fn limits() -> Result<(), Failure> {
    limit(libc::RLIMIT_CORE, 0)?;
    limit(libc::RLIMIT_AS, 512 * 1024 * 1024)?;
    limit(libc::RLIMIT_CPU, 2)?;
    limit(libc::RLIMIT_NOFILE, 32)?;
    // Parent's wall deadline is also 3s; this bounds a caller that never closes stdin.
    if unsafe { libc::signal(libc::SIGALRM, libc::SIG_DFL) } == libc::SIG_ERR {
        return Err("unavailable");
    }
    unsafe {
        libc::alarm(3);
    }
    Ok(())
}

#[cfg(target_arch = "x86_64")]
fn restrict() -> Result<(), Failure> {
    // Require ABI3: all VFS read/create/delete/rename/write/truncate rights, zero grants.
    // Anonymous sealed memfds are not ambient filesystem objects; no /proc grant.
    let abi = unsafe {
        libc::syscall(
            libc::SYS_landlock_create_ruleset,
            ptr::null::<c_void>(),
            0,
            1,
        )
    };
    if abi < 3 {
        return Err("unavailable");
    }
    let rights: u64 = (1 << 15) - 1;
    let ruleset = unsafe { libc::syscall(libc::SYS_landlock_create_ruleset, &rights, 8, 0) };
    if ruleset < 0 {
        return Err("unavailable");
    }
    let ruleset = unsafe { OwnedFd::from_raw_fd(ruleset as c_int) };
    if unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0
        || unsafe { libc::syscall(libc::SYS_landlock_restrict_self, ruleset.as_raw_fd(), 0) } != 0
    {
        return Err("unavailable");
    }
    drop(ruleset);
    // Fail closed on any unlisted syscall, alternate ABI, x32 call or future syscall.
    // openat is read-only; write is stdout/stderr only; executable mappings denied.
    let load = |offset| libc::sock_filter {
        code: 0x20,
        jt: 0,
        jf: 0,
        k: offset,
    };
    let equal = |value, yes, no| libc::sock_filter {
        code: 0x15,
        jt: yes,
        jf: no,
        k: value,
    };
    let ret = |value| libc::sock_filter {
        code: 0x06,
        jt: 0,
        jf: 0,
        k: value,
    };
    let allow = 0x7fff0000;
    let deny = 0x00050000 | libc::EPERM as u32;
    let mut code = vec![load(4), equal(0xc000003e, 1, 0), ret(0x80000000), load(0)];
    for syscall in [
        libc::SYS_read,
        libc::SYS_pread64,
        libc::SYS_close,
        libc::SYS_fstat,
        libc::SYS_lseek,
        libc::SYS_munmap,
        libc::SYS_brk,
        libc::SYS_madvise,
        libc::SYS_futex,
        libc::SYS_clock_gettime,
        libc::SYS_getrandom,
        libc::SYS_rt_sigaction,
        libc::SYS_rt_sigprocmask,
        libc::SYS_rt_sigreturn,
        libc::SYS_sigaltstack,
        libc::SYS_getpid,
        libc::SYS_gettid,
        libc::SYS_sched_yield,
        libc::SYS_exit,
        libc::SYS_exit_group,
        libc::SYS_getrlimit,
    ] {
        code.extend([equal(syscall as u32, 0, 1), ret(allow)]);
    }
    // Branch bodies finish with a return, so every subsequent branch sees syscall nr.
    code.extend([
        equal(libc::SYS_write as u32, 0, 5),
        load(16),
        equal(1, 1, 0),
        equal(2, 0, 1),
        ret(allow),
        ret(deny),
    ]);
    code.extend([
        equal(libc::SYS_openat as u32, 0, 4),
        load(32),
        libc::sock_filter {
            code: 0x45,
            jt: 0,
            jf: 1,
            k: (libc::O_ACCMODE | libc::O_CREAT | libc::O_TRUNC | libc::O_APPEND | libc::O_TMPFILE)
                as u32,
        },
        ret(deny),
        ret(allow),
    ]);
    code.extend([
        equal(libc::SYS_mmap as u32, 0, 7),
        load(32),
        libc::sock_filter {
            code: 0x45,
            jt: 0,
            jf: 1,
            k: libc::PROT_EXEC as u32,
        },
        ret(deny),
        load(40),
        libc::sock_filter {
            code: 0x45,
            jt: 0,
            jf: 1,
            k: libc::MAP_SHARED as u32,
        },
        ret(deny),
        ret(allow),
    ]);
    code.extend([
        equal(libc::SYS_mprotect as u32, 0, 4),
        load(32),
        libc::sock_filter {
            code: 0x45,
            jt: 0,
            jf: 1,
            k: libc::PROT_EXEC as u32,
        },
        ret(deny),
        ret(allow),
    ]);
    code.push(ret(deny));
    let program = libc::sock_fprog {
        len: code.len() as u16,
        filter: code.as_mut_ptr(),
    };
    if unsafe { libc::prctl(libc::PR_SET_SECCOMP, 2, &program) } != 0 {
        return Err("unavailable");
    }
    Ok(())
}
#[cfg(not(target_arch = "x86_64"))]
fn restrict() -> Result<(), Failure> {
    Err("unavailable")
}

fn forbidden(ch: char) -> bool {
    ch.is_control()
        || matches!(ch, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
}
fn word_valid(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 512
        && text.chars().count() <= 128
        && text.encode_utf16().count() <= 256
        && !text.chars().any(|ch| forbidden(ch) || ch.is_whitespace())
}
fn suggestion_valid(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 1024
        && text.chars().count() <= 256
        && text.encode_utf16().count() <= 512
        && text.trim() == text
        && !text.chars().any(forbidden)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    #[serde(rename = "protocolVersion")]
    protocol_version: u8,
    kind: String,
    word: String,
}
fn request(reader: &mut impl Read) -> Result<Request, Failure> {
    let mut size = [0; 4];
    reader
        .read_exact(&mut size)
        .map_err(|_| "invalid-request")?;
    let size = u32::from_be_bytes(size) as usize;
    if size == 0 || size > REQUEST_MAX {
        return Err("invalid-request");
    }
    let mut bytes = vec![0; size];
    reader
        .read_exact(&mut bytes)
        .map_err(|_| "invalid-request")?;
    let input: Request = linuxcast_protocol::parse(&bytes).map_err(|_| "invalid-request")?;
    if input.protocol_version != 1 || input.kind != "check" || !word_valid(&input.word) {
        return Err("invalid-request");
    }
    // One invocation, one request. A second frame/trailing byte is never acted on.
    let mut trailing = [0];
    if reader.read(&mut trailing).map_err(|_| "invalid-request")? != 0 {
        return Err("invalid-request");
    }
    Ok(input)
}
fn emit(output: &mut impl Write, value: serde_json::Value) -> Result<(), Failure> {
    let bytes = serde_json::to_vec(&value).map_err(|_| "unavailable")?;
    if bytes.len() > RESPONSE_MAX {
        return Err("malformed");
    }
    output
        .write_all(&(bytes.len() as u32).to_be_bytes())
        .and_then(|()| output.write_all(&bytes))
        .and_then(|()| output.flush())
        .map_err(|_| "unavailable")
}
fn checked(dictionary: &Dictionary<'_>, word: &str) -> Result<(bool, Vec<String>, bool), Failure> {
    let input = CString::new(word).map_err(|_| "invalid-request")?;
    if unsafe { (dictionary.library.spell)(dictionary.handle, input.as_ptr()) } != 0 {
        return Ok((true, Vec::new(), false));
    }
    let mut list = ptr::null_mut();
    let count =
        unsafe { (dictionary.library.suggest)(dictionary.handle, &mut list, input.as_ptr()) };
    if count < 0 {
        return Err("malformed");
    }
    let list = Suggestions {
        values: list,
        count,
        dictionary,
    };
    if count > 100_000 || count > 0 && list.values.is_null() {
        return Err("malformed");
    }
    let mut unique = HashSet::new();
    let mut output = Vec::new();
    let mut truncated = false;
    for index in 0..count as usize {
        let pointer = unsafe { *list.values.add(index) };
        if pointer.is_null() {
            return Err("malformed");
        }
        let size = unsafe { libc::strnlen(pointer, 1025) };
        if size > 1024 {
            return Err("malformed");
        }
        let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size) };
        let text = std::str::from_utf8(bytes).map_err(|_| "malformed")?;
        if !suggestion_valid(text) {
            return Err("malformed");
        }
        if unique.insert(text.to_owned()) {
            if output.len() < 32 {
                output.push(text.to_owned());
            } else {
                truncated = true;
            }
        }
    }
    Ok((false, output, truncated))
}
fn operation(input: &mut impl Read, output: &mut impl Write) -> Result<(), Failure> {
    limits()?;
    // Drop every inherited descriptor beyond the explicit stdio/source contract.
    if unsafe { libc::syscall(libc::SYS_close_range, 5_u32, u32::MAX, 0) } != 0 {
        return Err("unavailable");
    }
    let (aff, aff_bytes) = copy_source(3, AFF_MAX)?;
    let (dic, dic_bytes) = copy_source(4, DIC_MAX)?;
    unsafe {
        libc::close(3);
        libc::close(4);
    }
    validate_sources(&aff_bytes, &dic_bytes)?;
    drop((aff_bytes, dic_bytes));
    let library = Library::load()?;
    // Suppress native parser diagnostics, which can contain source text. This fixed
    // sink is opened before containment; no ambient descriptor survives otherwise.
    let sink = unsafe { libc::open(c"/dev/null".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC) };
    if sink < 0 || unsafe { libc::dup2(sink, 2) } < 0 {
        return Err("unavailable");
    }
    unsafe {
        libc::close(sink);
    }
    restrict()?;
    let aff_path = CString::new(format!("/proc/self/fd/{}", aff.as_raw_fd())).unwrap();
    let dic_path = CString::new(format!("/proc/self/fd/{}", dic.as_raw_fd())).unwrap();
    // Hunspell's constructor may return an empty handle after an fopen failure.
    // Verify both exact immutable sources remain readable under the required profile.
    for path in [&aff_path, &dic_path] {
        let mut file =
            File::open(path.to_str().map_err(|_| "unavailable")?).map_err(|_| "unavailable")?;
        file.read_exact(&mut [0]).map_err(|_| "unavailable")?;
    }
    let handle = unsafe { (library.create)(aff_path.as_ptr(), dic_path.as_ptr()) };
    if handle.is_null() {
        return Err("malformed");
    }
    let dictionary = Dictionary {
        handle,
        library: &library,
    };
    let encoding = unsafe { (library.encoding)(dictionary.handle) };
    if encoding.is_null() {
        return Err("unsupported-encoding");
    }
    let size = unsafe { libc::strnlen(encoding, 33) };
    let value = if size <= 32 {
        unsafe { std::slice::from_raw_parts(encoding.cast::<u8>(), size) }
    } else {
        return Err("unsupported-encoding");
    };
    if !value.eq_ignore_ascii_case(b"UTF-8") && !value.eq_ignore_ascii_case(b"UTF8") {
        return Err("unsupported-encoding");
    }
    emit(
        output,
        json!({"protocolVersion":1,"kind":"ready","backend":"hunspell-1.7"}),
    )?;
    let input = request(input)?;
    let (correct, suggestions, truncated) = checked(&dictionary, &input.word)?;
    emit(
        output,
        json!({"protocolVersion":1,"kind":"result","backend":"hunspell-1.7","word":input.word,"correct":correct,"suggestions":suggestions,"truncated":truncated}),
    )
}
/// Fixed packaged mode only; errors carry no dictionary paths, word or source text.
pub fn run_stdio() -> Result<(), Failure> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    match operation(&mut stdin.lock(), &mut output) {
        Ok(()) => Ok(()),
        Err(code) => {
            emit(
                &mut output,
                json!({"protocolVersion":1,"kind":"failed","code":code}),
            )?;
            Err(code)
        }
    }
}

// Test-only entry into the exact production profile; never an operation/argv mode.
#[cfg(test)]
#[allow(dead_code)] // Called by the integration test which includes this module, not the lib-test target.
pub(crate) fn profile_for_test() -> Result<OwnedFd, Failure> {
    let memory = sealed(b"public sealed dictionary bytes")?;
    let expected = libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE;
    if unsafe { libc::fcntl(memory.as_raw_fd(), libc::F_GET_SEALS) } != expected {
        return Err("unavailable");
    }
    limits()?;
    restrict()?;
    Ok(memory)
}

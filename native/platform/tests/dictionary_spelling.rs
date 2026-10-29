//! Authored public fixtures; actual fixed system Hunspell and actual Linux containment.
use serde_json::{Value, json};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::fs::MetadataExt;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[allow(dead_code)]
#[path = "../src/dictionary_spelling.rs"]
mod worker;

const AFF: &str = "SET UTF-8\nTRY abcdefghijklmnopqrstuvwxyzé\nSFX S Y 1\nSFX S 0 s .\nFORBIDDENWORD F\nCOMPOUNDFLAG C\nCOMPOUNDMIN 2\nREP 2\nREP cafee café\nREP icecream ice_cream\n";
const DIC: &str = "8\ncat/S\nblocked/F\nsun/C\nflower/C\ncafé\nice\ncream\nice cream\n";
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "linuxcast-spelling-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        let result = Self(path);
        result.sources(AFF.as_bytes(), DIC.as_bytes());
        result
    }
    fn sources(&self, aff: &[u8], dic: &[u8]) {
        fs::write(self.0.join("public.aff"), aff).unwrap();
        fs::write(self.0.join("public.dic"), dic).unwrap();
    }
    fn command(&self, deny_landlock: bool) -> Command {
        self.command_with(deny_landlock, false)
    }
    fn command_with(&self, deny_landlock: bool, writable: bool) -> Command {
        let aff = File::options()
            .read(true)
            .write(writable)
            .open(self.0.join("public.aff"))
            .unwrap();
        let dic = File::options()
            .read(true)
            .write(writable)
            .open(self.0.join("public.dic"))
            .unwrap();
        // High CLOEXEC duplicates avoid dup2 aliasing the other source or stdio.
        let a = unsafe { libc::fcntl(aff.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 10) };
        let d = unsafe { libc::fcntl(dic.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 10) };
        assert!(a >= 10 && d >= 10);
        let a = unsafe { OwnedFd::from_raw_fd(a) };
        let d = unsafe { OwnedFd::from_raw_fd(d) };
        let mut command = Command::new(env!("CARGO_BIN_EXE_linuxcast-platform"));
        command
            .arg("dictionary-spell")
            .env_clear()
            .env("LANG", "C.UTF-8")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Only fixed public fixture descriptors and a test-only deny syscall policy.
        unsafe {
            command.pre_exec(move || {
                if libc::dup2(a.as_raw_fd(), 3) < 0 || libc::dup2(d.as_raw_fd(), 4) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                if deny_landlock {
                    let mut filter = [
                        libc::sock_filter {
                            code: 0x20,
                            jt: 0,
                            jf: 0,
                            k: 0,
                        },
                        libc::sock_filter {
                            code: 0x15,
                            jt: 0,
                            jf: 1,
                            k: libc::SYS_landlock_create_ruleset as u32,
                        },
                        libc::sock_filter {
                            code: 0x06,
                            jt: 0,
                            jf: 0,
                            k: 0x00050000 | libc::ENOSYS as u32,
                        },
                        libc::sock_filter {
                            code: 0x06,
                            jt: 0,
                            jf: 0,
                            k: 0x7fff0000,
                        },
                    ];
                    let program = libc::sock_fprog {
                        len: filter.len() as u16,
                        filter: filter.as_mut_ptr(),
                    };
                    if libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
                        || libc::prctl(libc::PR_SET_SECCOMP, 2, &program) != 0
                    {
                        return Err(std::io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
        command
    }
    fn run(&self, bytes: &[u8]) -> (Vec<Value>, std::process::ExitStatus) {
        let mut child = self.command(false).spawn().unwrap();
        child.stdin.take().unwrap().write_all(bytes).unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(
            output.stderr.is_empty() || output.stderr == b"PLATFORM_SPELLING_UNAVAILABLE\n",
            "Only fixed redacted initialization diagnostics"
        );
        (frames(&output.stdout), output.status)
    }
    fn check(&self, word: &str) -> Value {
        let (events, status) = self.run(&frame(
            json!({"protocolVersion":1,"kind":"check","word":word}),
        ));
        assert!(
            status.success(),
            "Actual library/profile required: {events:?}"
        );
        assert_eq!(events.len(), 2);
        assert_eq!(
            events[0],
            json!({"protocolVersion":1,"kind":"ready","backend":"hunspell-1.7"})
        );
        assert_eq!(events[1]["kind"], "result");
        assert_eq!(events[1]["word"], word);
        assert_eq!(events[1]["backend"], "hunspell-1.7");
        events[1].clone()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn frame(value: Value) -> Vec<u8> {
    raw_frame(&serde_json::to_vec(&value).unwrap())
}
fn raw_frame(bytes: &[u8]) -> Vec<u8> {
    [((bytes.len() as u32).to_be_bytes()).as_slice(), bytes].concat()
}
fn frames(mut bytes: &[u8]) -> Vec<Value> {
    let mut values = Vec::new();
    while !bytes.is_empty() {
        assert!(bytes.len() >= 4);
        let size = u32::from_be_bytes(bytes[..4].try_into().unwrap()) as usize;
        assert!((1..=65_536).contains(&size) && bytes.len() >= size + 4);
        values.push(serde_json::from_slice(&bytes[4..size + 4]).unwrap());
        bytes = &bytes[size + 4..];
    }
    values
}
fn read_event(child: &mut Child) -> Value {
    let out = child.stdout.as_mut().unwrap();
    let mut header = [0; 4];
    out.read_exact(&mut header).unwrap();
    let size = u32::from_be_bytes(header) as usize;
    assert!((1..=65_536).contains(&size));
    let mut value = vec![0; size];
    out.read_exact(&mut value).unwrap();
    serde_json::from_slice(&value).unwrap()
}
fn identity(path: &std::path::Path) -> (u64, u64, i64, i64, i64, i64) {
    let m = fs::metadata(path).unwrap();
    (
        m.ino(),
        m.len(),
        m.mtime(),
        m.mtime_nsec(),
        m.ctime(),
        m.ctime_nsec(),
    )
}

#[test]
fn real_affixes_forbidden_compounds_and_unicode_are_not_base_word_guessing() {
    let f = Fixture::new();
    for word in ["cat", "cats", "sunflower", "café"] {
        let result = f.check(word);
        assert_eq!(result["correct"], true, "{word}");
        assert_eq!(result["suggestions"], json!([]));
        assert_eq!(result["truncated"], false);
    }
    for word in ["blocked", "blockedcats", "catss", "zzzzzzzzzzzzzzzz"] {
        assert_eq!(f.check(word)["correct"], false, "{word}");
    }
}
#[test]
fn real_suggestions_preserve_native_order_unicode_and_internal_spaces() {
    let f = Fixture::new();
    let result = f.check("cafee");
    let suggestions = result["suggestions"].as_array().unwrap();
    assert_eq!(suggestions.first(), Some(&json!("café")));
    assert_eq!(
        f.check("icecream")["suggestions"]
            .as_array()
            .unwrap()
            .first(),
        Some(&json!("ice cream"))
    );
    let values = f.check("catt");
    let words = values["suggestions"].as_array().unwrap();
    assert!(words.contains(&json!("cat")));
    assert_eq!(
        words.iter().collect::<std::collections::HashSet<_>>().len(),
        words.len()
    );
    assert!(words.len() <= 32);
    assert_eq!(f.check("zzzzzzzzzzzzzzzz")["suggestions"], json!([]));
}
#[test]
fn source_descriptors_are_copied_then_closed_and_disk_bytes_are_unchanged() {
    let f = Fixture::new();
    let aff = f.0.join("public.aff");
    let dic = f.0.join("public.dic");
    let before = (identity(&aff), identity(&dic));
    let mut child = f.command(false).spawn().unwrap();
    assert_eq!(read_event(&mut child)["kind"], "ready");
    let descriptors = fs::read_dir(format!("/proc/{}/fd", child.id()))
        .unwrap()
        .map(|entry| fs::read_link(entry.unwrap().path()).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        descriptors
            .iter()
            .filter(|path| path.to_string_lossy().contains("memfd:linuxcast-spelling"))
            .count(),
        2
    );
    assert!(!descriptors.contains(&aff) && !descriptors.contains(&dic));
    assert_eq!(
        descriptors.len(),
        5,
        "Only stdio and two sealed source snapshots survive"
    );
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&frame(
            json!({"protocolVersion":1,"kind":"check","word":"cats"}),
        ))
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(frames(&output.stdout)[0]["correct"], true);
    assert_eq!((identity(&aff), identity(&dic)), before);
    assert_eq!(fs::read(aff).unwrap(), AFF.as_bytes());
    assert_eq!(fs::read(dic).unwrap(), DIC.as_bytes());
}
#[test]
fn sealed_snapshot_survives_external_source_change_without_reading_new_disk_bytes() {
    let f = Fixture::new();
    let mut child = f.command(false).spawn().unwrap();
    assert_eq!(read_event(&mut child)["kind"], "ready");
    fs::write(f.0.join("public.dic"), "1\nreplacement\n").unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&frame(
            json!({"protocolVersion":1,"kind":"check","word":"cats"}),
        ))
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(frames(&output.stdout)[0]["correct"], true);
    assert_eq!(f.check("replacement")["correct"], true);
}
#[test]
fn rejects_incompatible_encoding_malformed_source_and_oversize_before_native_parse() {
    let f = Fixture::new();
    for (aff, dic, code) in [
        (
            b"SET ISO8859-1\n".as_slice(),
            DIC.as_bytes(),
            "unsupported-encoding",
        ),
        (b"SET UTF-8\nSET UTF-8\n", DIC.as_bytes(), "malformed"),
        (b"SFX S Y 0\n", DIC.as_bytes(), "malformed"),
        (b"SET UTF-8\n", b"2\ncat\n", "malformed"),
        (b"SET UTF-8\n", b"1\nca\xfft\n", "malformed"),
        (b"SET UTF-8\n", b"1\ncat\0\n", "malformed"),
    ] {
        f.sources(aff, dic);
        let (events, status) = f.run(&[]);
        assert_eq!(status.code(), Some(1));
        assert_eq!(
            events,
            json!([{"protocolVersion":1,"kind":"failed","code":code}])
                .as_array()
                .unwrap()
                .clone()
        );
    }
    for (name, limit) in [
        ("public.aff", 1024 * 1024),
        ("public.dic", 16 * 1024 * 1024),
    ] {
        f.sources(AFF.as_bytes(), DIC.as_bytes());
        File::options()
            .write(true)
            .open(f.0.join(name))
            .unwrap()
            .set_len(limit + 1)
            .unwrap();
        let (events, status) = f.run(&[]);
        assert_eq!(status.code(), Some(1));
        assert_eq!(events[0]["code"], "malformed");
    }
}
#[test]
fn strict_single_framed_request_rejects_invalid_words_fields_duplicates_and_extra_bytes() {
    let f = Fixture::new();
    let mut invalid = vec![
        vec![],
        vec![0, 0],
        vec![0, 0, 0, 0],
        vec![0, 0, 16, 1],
        vec![0, 0, 0, 3, b'{'],
        raw_frame(b"not-json"),
        raw_frame(br#"{"protocolVersion":1,"kind":"check","word":"cat","word":"cats"}"#),
    ];
    for word in [
        "",
        "two words",
        "cat\n",
        "cat\u{200e}",
        "\u{061c}cat",
        " cat",
        &"x".repeat(129),
        &"🦆".repeat(129),
    ] {
        invalid.push(frame(
            json!({"protocolVersion":1,"kind":"check","word":word}),
        ));
    }
    for value in [
        json!({"protocolVersion":2,"kind":"check","word":"cat"}),
        json!({"protocolVersion":1,"kind":"suggest","word":"cat"}),
        json!({"protocolVersion":1,"kind":"check","word":"cat","path":"/private/secret"}),
        json!({"protocolVersion":1,"kind":"check","word":null}),
    ] {
        invalid.push(frame(value));
    }
    let valid = frame(json!({"protocolVersion":1,"kind":"check","word":"cat"}));
    invalid.push([valid.as_slice(), valid.as_slice()].concat());
    invalid.push([valid.as_slice(), &[0]].concat());
    for input in invalid {
        let (events, status) = f.run(&input);
        assert_eq!(status.code(), Some(1));
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["kind"], "ready");
        assert_eq!(
            events[1],
            json!({"protocolVersion":1,"kind":"failed","code":"invalid-request"})
        );
    }
    for word in ["x".repeat(128), "🦆".repeat(128)] {
        assert_eq!(f.check(&word)["word"], word);
    }
    // Exact non-normalized Unicode is echoed, with no fabricated equivalence.
    assert_eq!(f.check("cafe\u{301}")["word"], "cafe\u{301}");
}
#[test]
fn missing_required_landlock_is_unavailable_without_uncontained_result() {
    let f = Fixture::new();
    let mut child = f.command(true).spawn().unwrap();
    drop(child.stdin.take());
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(
        frames(&output.stdout),
        vec![json!({"protocolVersion":1,"kind":"failed","code":"unavailable"})]
    );
}
#[test]
fn resources_are_enforced_and_stalled_request_is_killed_by_worker_deadline() {
    let f = Fixture::new();
    let start = Instant::now();
    let mut child = f.command(false).spawn().unwrap();
    assert_eq!(read_event(&mut child)["kind"], "ready");
    let limits = fs::read_to_string(format!("/proc/{}/limits", child.id())).unwrap();
    for (label, value) in [
        ("Max cpu time", "2"),
        ("Max core file size", "0"),
        ("Max open files", "32"),
        ("Max address space", "536870912"),
    ] {
        let line = limits.lines().find(|line| line.starts_with(label)).unwrap();
        assert_eq!(line[label.len()..].split_whitespace().next(), Some(value));
    }
    let status = fs::read_to_string(format!("/proc/{}/status", child.id())).unwrap();
    assert!(status.contains("NoNewPrivs:\t1"));
    assert!(status.contains("Seccomp:\t2"));
    let _held_stdin = child.stdin.take().unwrap();
    assert_eq!(child.wait().unwrap().signal(), Some(libc::SIGALRM));
    assert!(start.elapsed() >= Duration::from_secs(2) && start.elapsed() < Duration::from_secs(5));
}
#[test]
fn containment_denies_private_files_network_exec_descendants_and_mutation() {
    let f = Fixture::new();
    let secret = f.0.join("public-denial-sentinel");
    fs::write(&secret, "PUBLIC_DENIED").unwrap();
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "containment_probe_child", "--nocapture"])
        .env("LINUXCAST_SPELLING_TEST_PROBE", &secret)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(fs::read_to_string(secret).unwrap(), "PUBLIC_DENIED");
}
#[test]
fn containment_probe_child() {
    let Some(path) = std::env::var_os("LINUXCAST_SPELLING_TEST_PROBE") else {
        return;
    };
    let memory = worker::profile_for_test().expect("real containment required");
    assert_eq!(
        fs::read(format!("/proc/self/fd/{}", memory.as_raw_fd())).unwrap(),
        b"public sealed dictionary bytes"
    );
    for path in [
        PathBuf::from(path),
        PathBuf::from("/etc/passwd"),
        PathBuf::from("/proc/self/mem"),
    ] {
        assert_eq!(
            File::open(path).unwrap_err().kind(),
            std::io::ErrorKind::PermissionDenied
        );
    }
    let denied = |value: libc::c_long| {
        assert_eq!(value, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::EPERM)
        );
    };
    unsafe {
        denied(libc::socket(libc::AF_INET, libc::SOCK_STREAM, 0) as _);
        denied(libc::socket(libc::AF_UNIX, libc::SOCK_STREAM, 0) as _);
        denied(libc::syscall(
            libc::SYS_execve,
            c"/bin/true".as_ptr(),
            std::ptr::null::<*const u8>(),
            std::ptr::null::<*const u8>(),
        ));
        denied(libc::syscall(libc::SYS_fork));
        denied(libc::syscall(libc::SYS_clone3, std::ptr::null::<u8>(), 0));
        denied(libc::pwrite(memory.as_raw_fd(), c"overwrite".as_ptr().cast(), 1, 0) as _);
        denied(libc::ftruncate(memory.as_raw_fd(), 0) as _);
        denied(libc::unlink(c"/tmp/linuxcast-must-not-create".as_ptr()) as _);
        denied(libc::kill(libc::getppid(), 0) as _);
        denied(libc::syscall(
            libc::SYS_io_uring_setup,
            1,
            std::ptr::null::<u8>(),
        ));
        denied(libc::syscall(libc::SYS_ptrace, 0, 0, 0, 0));
        assert_eq!(
            libc::mmap(
                std::ptr::null_mut(),
                4096,
                libc::PROT_READ | libc::PROT_EXEC,
                libc::MAP_PRIVATE | libc::MAP_ANONYMOUS,
                -1,
                0
            ),
            libc::MAP_FAILED
        );
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::EPERM)
        );
    }
    std::process::exit(0);
}

#[test]
fn refuses_missing_special_or_writable_inherited_source_descriptors() {
    let f = Fixture::new();
    let mut child = f.command_with(false, true).spawn().unwrap();
    drop(child.stdin.take());
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(frames(&output.stdout)[0]["code"], "malformed");
    assert_eq!(fs::read(f.0.join("public.dic")).unwrap(), DIC.as_bytes());
    fs::remove_file(f.0.join("public.aff")).unwrap();
    fs::create_dir(f.0.join("public.aff")).unwrap();
    let (events, status) = f.run(&[]);
    assert_eq!(status.code(), Some(1));
    assert_eq!(events[0]["code"], "malformed");
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-platform"))
        .arg("dictionary-spell")
        .env_clear()
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(frames(&output.stdout)[0]["code"], "malformed");
}

#[test]
fn native_utf8_declaration_accepts_bom_comments_and_still_rejects_duplicate_set() {
    let f = Fixture::new();
    for declaration in [
        "SET UTF-8 # public comment",
        "\u{feff}SET UTF-8 # public comment",
    ] {
        f.sources(
            AFF.replacen("SET UTF-8", declaration, 1).as_bytes(),
            format!("\u{feff}{DIC}").as_bytes(),
        );
        assert_eq!(f.check("café")["correct"], true);
        assert_eq!(f.check("cats")["correct"], true);
    }
    f.sources(
        AFF.replacen("SET UTF-8", "SET UTF-8#comment", 1).as_bytes(),
        DIC.as_bytes(),
    );
    let (events, status) = f.run(&[]);
    assert_eq!(status.code(), Some(1));
    assert_eq!(events[0]["code"], "unsupported-encoding");
    f.sources(
        "\u{feff}SET UTF-8 # first\nSET UTF-8 # duplicate\n".as_bytes(),
        DIC.as_bytes(),
    );
    let (events, status) = f.run(&[]);
    assert_eq!(status.code(), Some(1));
    assert_eq!(events[0]["code"], "malformed");
}

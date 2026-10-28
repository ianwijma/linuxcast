use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::os::unix::fs::{MetadataExt, PermissionsExt, symlink};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "linuxcast-text-preview-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(root.join("selected")).unwrap();
        Self(root)
    }
    fn write(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join("selected").join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
    fn input(&self, name: &str) -> Value {
        let metadata = fs::metadata(self.0.join("selected").join(name)).unwrap();
        json!({"protocolVersion":1,"operation":"preview-text","rootPath":self.0.join("selected"),"relativePath":name,
            "size":metadata.len(),"modifiedMs":metadata.mtime()*1000+metadata.mtime_nsec()/1_000_000})
    }
    fn request(input: Value) -> Value {
        let mut child = Command::new(env!("CARGO_BIN_EXE_linuxcast-platform"))
            .arg("applications")
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(&serde_json::to_vec(&input).unwrap())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        assert!(output.stderr.is_empty(), "No content/path diagnostics");
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["protocolVersion"], 1);
        value
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn failure(code: &str) -> Value {
    json!({"protocolVersion":1,"ok":false,"error":code})
}

#[test]
fn previews_only_literal_utf8_and_preserves_source_bytes() {
    let f = Fixture::new();
    let text = "# Public <script>literal</script>\nUnicode: 雪 🐧\t\r\n";
    for extension in ["txt", "TEXT", "md", "CSV", "json", "log"] {
        let name = format!("public.{extension}");
        let path = f.write(&name, text.as_bytes());
        let before = fs::metadata(&path).unwrap();
        assert_eq!(
            Fixture::request(f.input(&name)),
            json!({"protocolVersion":1,"ok":true,"value":{"outcome":"previewed","text":text}})
        );
        assert_eq!(fs::read(&path).unwrap(), text.as_bytes());
        let after = fs::metadata(&path).unwrap();
        assert_eq!(
            (
                before.ino(),
                before.len(),
                before.mtime(),
                before.mtime_nsec(),
                before.ctime(),
                before.ctime_nsec()
            ),
            (
                after.ino(),
                after.len(),
                after.mtime(),
                after.mtime_nsec(),
                after.ctime(),
                after.ctime_nsec()
            )
        );
    }
    f.write("empty.txt", b"");
    assert_eq!(Fixture::request(f.input("empty.txt"))["value"]["text"], "");
    f.write("bound.txt", &vec![b'x'; 65_536]);
    assert_eq!(
        Fixture::request(f.input("bound.txt"))["value"]["text"]
            .as_str()
            .unwrap()
            .len(),
        65_536
    );
}

#[test]
fn rejects_content_format_extensions_and_executable_mode_without_returning_content() {
    let f = Fixture::new();
    for bytes in [
        b"public\0hidden".as_slice(),
        b"public\x1b[31m",
        b"public\x7f",
        b"\xff\xfe",
        b"\xc0\xaf",
    ] {
        f.write("binary.txt", bytes);
        assert_eq!(
            Fixture::request(f.input("binary.txt")),
            failure("unavailable")
        );
    }
    for name in [
        "public.html",
        "public.desktop",
        "public.svg",
        "txt",
        "public.txt.exe",
    ] {
        f.write(name, b"public");
        assert_eq!(Fixture::request(f.input(name)), failure("unavailable"));
    }
    let executable = f.write("program.txt", b"public");
    fs::set_permissions(executable, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(
        Fixture::request(f.input("program.txt")),
        failure("unavailable")
    );
}

#[test]
fn rejects_stale_missing_grown_directory_fifo_and_symlink_targets() {
    let f = Fixture::new();
    let file = f.write("public.txt", b"public");
    let admitted = f.input("public.txt");
    let mut input = admitted.clone();
    input["size"] = json!(5);
    assert_eq!(Fixture::request(input), failure("stale-application"));
    let mut input = admitted.clone();
    input["modifiedMs"] = json!(0);
    assert_eq!(Fixture::request(input), failure("stale-application"));
    fs::write(&file, vec![b'x'; 65_537]).unwrap();
    assert_eq!(Fixture::request(admitted.clone()), failure("unavailable"));
    fs::remove_file(&file).unwrap();
    assert_eq!(
        Fixture::request(admitted.clone()),
        failure("stale-application")
    );
    fs::create_dir(&file).unwrap();
    assert_eq!(Fixture::request(admitted.clone()), failure("unavailable"));
    fs::remove_dir(&file).unwrap();
    let fifo = std::ffi::CString::new(file.as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    assert_eq!(Fixture::request(admitted.clone()), failure("unavailable"));
    fs::remove_file(&file).unwrap();
    let outside = f.0.join("outside.txt");
    fs::write(&outside, b"OUTSIDE_PUBLIC_SENTINEL").unwrap();
    symlink(&outside, &file).unwrap();
    assert_eq!(Fixture::request(admitted), failure("stale-application"));
    assert_eq!(fs::read(outside).unwrap(), b"OUTSIDE_PUBLIC_SENTINEL");
}

#[test]
fn strict_protocol_and_path_bounds_reject_forged_authority() {
    let f = Fixture::new();
    f.write("public.txt", b"public");
    let input = f.input("public.txt");
    for (key, value) in [
        ("protocolVersion", json!(2)),
        ("size", json!(-1)),
        ("size", json!(65_537)),
        ("size", json!(1.5)),
        ("modifiedMs", json!(9_007_199_254_740_992_i64)),
        ("rootPath", json!("relative")),
        ("rootPath", json!("/tmp/../escape")),
        ("rootPath", json!("/tmp//escape")),
        ("relativePath", json!("../outside.txt")),
        ("relativePath", json!("/public.txt")),
        ("relativePath", json!("a//b.txt")),
        ("relativePath", json!("a/./b.txt")),
        ("relativePath", json!("bad\0.txt")),
        ("relativePath", json!("bad\n.txt")),
        ("relativePath", json!("x".repeat(4097))),
        ("handler", json!("untrusted")),
        ("uri", json!("file:///untrusted")),
        ("argv", json!(["untrusted"])),
        ("text", json!("caller content")),
    ] {
        let mut forged = input.clone();
        forged[key] = value;
        assert_eq!(
            Fixture::request(forged),
            failure("invalid-request"),
            "field {key}"
        );
    }
}

#[test]
fn ancestor_and_selected_root_symlinks_are_never_followed() {
    let f = Fixture::new();
    fs::create_dir(f.0.join("selected/sub")).unwrap();
    f.write("sub/public.txt", b"public");
    let input = f.input("sub/public.txt");
    fs::rename(f.0.join("selected/sub"), f.0.join("original-sub")).unwrap();
    symlink(f.0.join("original-sub"), f.0.join("selected/sub")).unwrap();
    assert_eq!(Fixture::request(input), failure("stale-application"));
    f.write("public.txt", b"public");
    let input = f.input("public.txt");
    fs::rename(f.0.join("selected"), f.0.join("original-root")).unwrap();
    symlink(f.0.join("original-root"), f.0.join("selected")).unwrap();
    assert_eq!(Fixture::request(input), failure("stale-application"));
}

#[test]
fn concurrent_ancestor_swaps_never_return_outside_content() {
    let f = Fixture::new();
    let selected = f.0.join("selected/sub");
    let parked = f.0.join("parked");
    let outside = f.0.join("outside");
    fs::create_dir(&selected).unwrap();
    fs::create_dir(&outside).unwrap();
    f.write("sub/public.txt", b"public");
    fs::write(outside.join("public.txt"), b"OUTSIDE_PUBLIC_SENTINEL").unwrap();
    let input = f.input("sub/public.txt");
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let worker = std::thread::spawn(move || {
        while !flag.load(Ordering::Relaxed) {
            fs::rename(&selected, &parked).unwrap();
            symlink(&outside, &selected).unwrap();
            std::thread::yield_now();
            fs::remove_file(&selected).unwrap();
            fs::rename(&parked, &selected).unwrap();
        }
    });
    let outcomes: Vec<Value> = (0..16).map(|_| Fixture::request(input.clone())).collect();
    stop.store(true, Ordering::Relaxed);
    worker.join().unwrap();
    for outcome in outcomes {
        assert!(
            outcome == failure("stale-application")
                || outcome
                    == json!({"protocolVersion":1,"ok":true,"value":{"outcome":"previewed","text":"public"}})
        );
    }
    assert_eq!(
        fs::read(f.0.join("selected/sub/public.txt")).unwrap(),
        b"public"
    );
    assert_eq!(
        fs::read(f.0.join("outside/public.txt")).unwrap(),
        b"OUTSIDE_PUBLIC_SENTINEL"
    );
}

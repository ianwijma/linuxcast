use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
struct Fixture {
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "linuxcast-applications-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        for dir in [
            "data/applications",
            "system/applications",
            "config",
            "runtime",
            "cache",
        ] {
            fs::create_dir_all(root.join(dir)).unwrap();
        }
        let executable = root.join("fixture executable");
        fs::write(&executable, include_str!("applications/fixture.py")).unwrap();
        fs::set_permissions(executable, fs::Permissions::from_mode(0o700)).unwrap();
        Self { root }
    }
    fn entry(&self, id: &str, extra: &str) {
        fs::write(self.root.join("data/applications").join(id), format!("[Desktop Entry]\nType=Application\nName=Synthetic Application\nComment=Public fixture\nExec=\"{}\" \"two words\" \"literal;$(no-shell)\" %c %% %f %u\n{extra}\n",self.root.join("fixture executable").display())).unwrap();
    }
    fn request_bytes(&self, input: &[u8]) -> Value {
        let mut child = Command::new(env!("CARGO_BIN_EXE_linuxcast-platform"))
            .arg("applications")
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .env("HOME", &self.root)
            .env("LANG", "C.UTF-8")
            .env("XDG_CURRENT_DESKTOP", "GNOME")
            .env("XDG_DATA_HOME", self.root.join("data"))
            .env("XDG_DATA_DIRS", self.root.join("system"))
            .env("XDG_CONFIG_HOME", self.root.join("config"))
            .env("XDG_CONFIG_DIRS", self.root.join("config"))
            .env("XDG_CACHE_HOME", self.root.join("cache"))
            .env("XDG_RUNTIME_DIR", self.root.join("runtime"))
            .env(
                "DBUS_SESSION_BUS_ADDRESS",
                "unix:path=/nonexistent-linuxcast-fixture-bus",
            )
            .env("LINUXCAST_FIXTURE_MARKER", self.root.join("marker.json"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(input).unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        assert!(output.stderr.is_empty(), "No raw diagnostics allowed");
        serde_json::from_slice(&output.stdout).unwrap()
    }
    fn request(&self, request: Value) -> Value {
        self.request_bytes(&serde_json::to_vec(&request).unwrap())
    }
    fn list(&self) -> Value {
        self.request(json!({"protocolVersion":1,"operation":"list","limit":100}))
    }
    fn launch(&self, app: &Value) -> Value {
        self.request(json!({"protocolVersion":1,"operation":"launch","desktopId":app["desktopId"],"fingerprint":app["fingerprint"]}))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).unwrap();
    }
}
#[test]
fn discovery_is_visible_sorted_paged_and_launches_gio_arguments_without_protocol_leaks() {
    let f = Fixture::new();
    f.entry("z.desktop", "");
    f.entry("a.desktop", "");
    f.entry("hidden.desktop", "Hidden=true");
    f.entry("nodisplay.desktop", "NoDisplay=true");
    f.entry("other.desktop", "OnlyShowIn=KDE;");
    f.entry("excluded.desktop", "NotShowIn=GNOME;");
    f.entry("missing.desktop", "TryExec=/nonexistent-linuxcast-fixture");
    fs::write(
        f.root.join("data/applications/malformed.desktop"),
        "[Desktop Entry]\nType=Application\nName=Malformed\nExec=\"unclosed\n",
    )
    .unwrap();
    fs::write(
        f.root.join("data/applications/noexec.desktop"),
        "[Desktop Entry]\nType=Application\nName=No executable\n",
    )
    .unwrap();
    let first = f.request(json!({"protocolVersion":1,"operation":"list","limit":1}));
    assert_eq!(first["value"]["nextCursor"], "a.desktop");
    let app = &first["value"]["applications"][0];
    assert_eq!(app["desktopId"], "a.desktop");
    let second =
        f.request(json!({"protocolVersion":1,"operation":"list","limit":1,"afterId":"a.desktop"}));
    assert_eq!(second["value"]["applications"].as_array().unwrap().len(), 1);
    assert_eq!(second["value"]["applications"][0]["desktopId"], "z.desktop");
    assert!(second["value"]["nextCursor"].is_null());
    assert_eq!(f.launch(app)["value"]["outcome"], "dispatched");
    let until = Instant::now() + Duration::from_secs(3);
    while !f.root.join("marker.json").exists() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(10));
    }
    let marker: Value =
        serde_json::from_slice(&fs::read(f.root.join("marker.json")).unwrap()).unwrap();
    assert_eq!(
        marker["argv"],
        json!([
            "two words",
            "literal;$(no-shell)",
            "Synthetic Application",
            "%"
        ])
    );
    assert_eq!(marker["stdin"], "");
}
#[test]
fn changed_hidden_missing_entries_and_executables_fail_closed() {
    let f = Fixture::new();
    f.entry("app.desktop", "");
    let app = f.list()["value"]["applications"][0].clone();
    f.entry("app.desktop", "Terminal=true");
    assert_eq!(f.launch(&app)["error"], "stale-application");
    f.entry("app.desktop", "Hidden=true");
    assert_eq!(f.launch(&app)["error"], "stale-application");
    fs::remove_file(f.root.join("data/applications/app.desktop")).unwrap();
    assert_eq!(f.launch(&app)["error"], "stale-application");
    f.entry("app.desktop", "");
    fs::remove_file(f.root.join("fixture executable")).unwrap();
    assert_eq!(f.launch(&app)["error"], "stale-application");
    assert_eq!(f.list()["value"]["applications"], json!([]));
    assert!(!f.root.join("marker.json").exists());
}
#[test]
fn rejects_unknown_fields_versions_paths_fingerprints_and_oversize_frames() {
    let f = Fixture::new();
    for request in [
        json!({"protocolVersion":2,"operation":"list","limit":1}),
        json!({"protocolVersion":1,"operation":"list","limit":101}),
        json!({"protocolVersion":1,"operation":"list","limit":1,"afterId":null}),
        json!({"protocolVersion":1,"operation":"list","limit":1,"query":"private"}),
        json!({"protocolVersion":1,"operation":"launch","desktopId":"../app.desktop","fingerprint":"0".repeat(64)}),
        json!({"protocolVersion":1,"operation":"launch","desktopId":"app.desktop","fingerprint":"A".repeat(64)}),
        json!({"protocolVersion":1,"operation":"launch","desktopId":"app.desktop","fingerprint":"0".repeat(64),"argv":["unsafe"]}),
    ] {
        assert_eq!(
            f.request(request),
            json!({"protocolVersion":1,"ok":false,"error":"invalid-request"})
        );
    }
    assert_eq!(
        f.request_bytes(&vec![b' '; 65_537])["error"],
        "invalid-request"
    );
    assert_eq!(f.request_bytes(b"{}\n{}\n")["error"], "invalid-request");
}

#[test]
fn changed_exec_is_stale_and_gio_spawn_failure_is_not_success() {
    let f = Fixture::new();
    f.entry("app.desktop", "");
    let old = f.list()["value"]["applications"][0].clone();
    let path = f.root.join("data/applications/app.desktop");
    let text = fs::read_to_string(&path).unwrap();
    fs::write(&path, text.replace("two words", "changed arguments")).unwrap();
    assert_eq!(f.launch(&old)["error"], "stale-application");
    f.entry(
        "app.desktop",
        "Path=/nonexistent-linuxcast-fixture-directory",
    );
    let current = f.list()["value"]["applications"][0].clone();
    assert_eq!(f.launch(&current)["error"], "launch-failed");
    assert!(!f.root.join("marker.json").exists());
}

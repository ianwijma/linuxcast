use std::os::unix::process::CommandExt;
use std::process::Command;

#[test]
fn actual_unprivileged_post_initialization_syscall_policy() {
    let mut command = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-worker"));
    command.arg("--policy-probe").env_clear();
    // This test needs no devices and drops a root build container to UID1000.
    // A normal development UID already has an empty effective capability set.
    if unsafe { libc::getuid() } == 0 {
        command.uid(1000).gid(1000);
    }
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "fixed policy subprocess failed: {:?}",
        output.status.code()
    );
    assert!(output.stderr.is_empty());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["emptyCapabilities"], true);
    assert_eq!(report["noCore"], true);
    assert_eq!(report["fileSocketExecCloneDenied"], true);
}

#[test]
fn worker_cannot_be_started_as_an_arbitrary_executor() {
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-worker"))
        .args(["--execute", "/bin/true"])
        .env_clear()
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let error: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(error["component"], "WORKER");
    assert_eq!(error["stage"], "WORKER_GUARD");
    assert_eq!(error["code"], "INTERNAL_ONLY");
}

#[test]
fn lab_requires_explicit_reviewed_guest_invocation_before_device_access() {
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-synthetic-lab"))
        .env_clear()
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let error: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(error["component"], "LAB");
    assert_eq!(error["stage"], "LAB_GUARD");
    assert_eq!(error["code"], "REVIEWED_DISPOSABLE_GUEST_REQUIRED");
}

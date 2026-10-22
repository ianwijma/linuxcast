use std::process::Command;

#[test]
fn typed_context_bridge_against_private_peer_only() {
    // Compile-time fixed fixture binary. It constructs private socketpairs and
    // synthetic sd-bus replies; it never connects to any host/session/system bus.
    let output = Command::new(env!("LINUXCAST_CONTEXT_PRIVATE_FIXTURE"))
        .env_clear()
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "private fixture exit {:?}",
        output.status.code()
    );
    assert!(output.stderr.is_empty());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["privatePeerFixture"], true);
    assert_eq!(report["casesPassed"], 14);
    assert_eq!(report["readMethodsOnly"], true);
}

#[test]
fn context_probe_rejects_caller_selected_identity_or_bus_before_reading() {
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-context-probe"))
        .args([
            "--pid",
            "1",
            "--address",
            "unix:path=/private-fixture-canary",
        ])
        .env_clear()
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let report: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(report["code"], "MONITOR_INVOCATION_REQUIRED");
    assert!(
        !output
            .stderr
            .windows(b"private-fixture-canary".len())
            .any(|p| p == b"private-fixture-canary")
    );
}

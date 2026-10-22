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

#[test]
fn kernel_peer_lifetime_brackets_mock_session_queries() {
    // Real post-fork AF_UNIX connect + SO_PEERPIDFD. All session replies are
    // private mocks: this is transport/lifetime evidence, never live logind.
    let output = Command::new(env!("LINUXCAST_CONTEXT_PEER_FIXTURE"))
        .env_clear()
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "private peer fixture exit {:?}, fixed report {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(output.stderr.is_empty());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report.as_object().unwrap().len(), 8);
    for name in [
        "realPeerTransport",
        "mockSessionAndBus",
        "retainedSocketDeathDenied",
        "midQueryDeathDenied",
        "sameUidNonrevival",
        "sessionAndUidChangesTerminal",
        "wrongUidUnsupportedWrongFdDisconnectedDenied",
        "clientPrincipalAndRightsNotAccepted",
    ] {
        assert_eq!(report[name], true);
    }
}

#[test]
fn rust_peer_api_consumes_transport_and_rejects_wrong_trusted_uid() {
    use linuxcast_input_spike::context::{Denial, PeerMonitor};
    use std::os::unix::net::UnixStream;
    // Isolated subprocess preserves the library's empty-environment contract;
    // no global environment mutation is safe inside a concurrent test process.
    if std::env::vars_os().next().is_some() {
        let output = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "rust_peer_api_consumes_transport_and_rejects_wrong_trusted_uid",
            ])
            .env_clear()
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(output.stderr.is_empty());
        return;
    }
    let (accepted, _client) = UnixStream::pair().unwrap();
    let uid = unsafe { libc::getuid() };
    let denied = PeerMonitor::bind_connected(accepted, if uid == 0 { 1 } else { 0 });
    assert!(matches!(denied, Err(Denial::UidMismatch)));
}

#[test]
fn peer_observer_rejects_every_environment_entry_before_binding() {
    for (key, value) in [
        ("UNRELATED_PRIVATE_CANARY", "PrivateEnvironmentCanary"),
        ("SYSTEMD_LOG_LEVEL", "debug"),
        ("DBUS_SYSTEM_BUS_ADDRESS", "unix:path=/PrivateBusCanary"),
    ] {
        let output = Command::new(env!("LINUXCAST_CONTEXT_PEER_FIXTURE"))
            .arg("--environment-denial")
            .env_clear()
            .env(key, value)
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(output.stderr.is_empty());
        assert_eq!(
            output.stdout,
            b"{\"environmentRejectedBeforeBinding\":true}\n"
        );
    }
}

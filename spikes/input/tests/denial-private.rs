//! No live bus or device operations. Private fixture binary only.
#[path = "../src/denial_observer.rs"]
#[allow(dead_code)]
mod denial_observer;
use std::io::{BufRead, BufReader};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::process::CommandExt;
use std::process::Command;
use std::time::{Duration, Instant};
fn abrupt(deadline: bool) {
    let start = Instant::now();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .arg(if deadline {
            "--private-deadline"
        } else {
            "--private-abrupt"
        })
        .env_clear()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    let value: serde_json::Value = serde_json::from_str(&ready).unwrap();
    assert_eq!(value["pathsRemoved"], true);
    let mut handles = Vec::new();
    for key in ["client", "helper"] {
        let pid = value[key].as_i64().unwrap() as i32;
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
        assert!(fd >= 0);
        handles.push((pid, unsafe { OwnedFd::from_raw_fd(fd as i32) }));
    }
    if !deadline {
        child.kill().unwrap();
    }
    let status = child.wait().unwrap();
    if deadline {
        assert_eq!(status.code(), Some(124));
        assert!(start.elapsed() >= Duration::from_secs(7));
        assert!(start.elapsed() < Duration::from_millis(7300));
    }
    for (pid, handle) in handles {
        let mut p = libc::pollfd {
            fd: handle.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        let died = unsafe { libc::poll(&mut p, 1, 500) } == 1;
        unsafe {
            libc::syscall(
                libc::SYS_pidfd_send_signal,
                handle.as_raw_fd(),
                libc::SIGKILL,
                0,
                0,
            );
            libc::waitpid(pid, std::ptr::null_mut(), 0);
        }
        assert!(died);
    }
}
fn main() {
    linuxcast_input_spike::diagnostics::panic_policy("DENIAL_PRIVATE");
    assert_eq!(unsafe { libc::clearenv() }, 0);
    linuxcast_input_spike::unix::no_core().unwrap();
    assert_eq!(
        unsafe { libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) },
        0
    );
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args == ["--private-suite"] {
        denial_observer::private_entry(&[]).unwrap();
        return;
    }
    if !args.is_empty() {
        denial_observer::private_entry(&args).unwrap();
        return;
    }
    unsafe {
        libc::alarm(15);
    }
    let mut command = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-probe"));
    command.arg("--PrivateCanary").env_clear();
    unsafe {
        command.pre_exec(|| {
            if libc::signal(libc::SIGCHLD, libc::SIG_IGN) == libc::SIG_ERR {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let output = command.output().unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty() && output.stderr.len() <= 384);
    let report: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(report["code"], "DENIAL_CHILD_REAPER_POLICY");
    // Exact public binaries reject inherited blocked guard signals before
    // startup/query work. The existing unblocked7s case still tests the alarm.
    for blocked in [libc::SIGALRM, libc::SIGTERM, libc::SIGINT] {
        for (binary, argument) in [
            (
                env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-probe"),
                "--PrivateCanary",
            ),
            (
                env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-helper"),
                "--internal-denial",
            ),
        ] {
            let mut command = Command::new(binary);
            command.arg(argument).env_clear();
            unsafe {
                command.pre_exec(move || {
                    let mut mask: libc::sigset_t = std::mem::zeroed();
                    libc::sigemptyset(&mut mask);
                    libc::sigaddset(&mut mask, blocked);
                    if libc::pthread_sigmask(libc::SIG_BLOCK, &mask, std::ptr::null_mut()) != 0 {
                        return Err(std::io::Error::from_raw_os_error(libc::EINVAL));
                    }
                    Ok(())
                });
            }
            let output = command.output().unwrap();
            assert_eq!(output.status.code(), Some(3));
            assert!(output.stdout.is_empty() && output.stderr.len() <= 384);
            let report: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
            assert_eq!(report["code"], "DENIAL_GUARD_SIGNAL_MASK");
        }
    }
    for (binary, arg) in [
        (
            env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-probe"),
            "--PrivateCanary",
        ),
        (
            env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-helper"),
            "--PrivateCanary",
        ),
    ] {
        let output = Command::new(binary)
            .arg(arg)
            .env_clear()
            .env("DBUS_SYSTEM_BUS_ADDRESS", "unix:path=/PrivateCanary")
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(3));
        assert!(output.stdout.is_empty());
        assert!(output.stderr.len() <= 384);
        assert!(!String::from_utf8_lossy(&output.stderr).contains("PrivateCanary"));
    }
    for (key, value) in [
        ("UNRELATED_ENVIRONMENT_CANARY", "PrivateEnvironmentCanary"),
        ("SYSTEMD_LOG_LEVEL", "debug"),
        ("DBUS_SYSTEM_BUS_ADDRESS", "unix:path=/PrivateBusCanary"),
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-helper"))
            .arg("--internal-denial")
            .env_clear()
            .env(key, value)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(3));
        assert!(output.stdout.is_empty());
        assert!(output.stderr.len() <= 384);
        let report: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
        assert_eq!(report["code"], "DENIAL_HELPER_ENV_OR_UID");
        assert!(!String::from_utf8_lossy(&output.stderr).contains(value));
    }
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-denial-helper"))
        .arg("--internal-denial")
        .env_clear()
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    assert!(output.stderr.len() <= 384);
    let output = Command::new(std::env::current_exe().unwrap())
        .arg("--private-suite")
        .env_clear()
        .output()
        .unwrap();
    if !output.status.success() && output.stderr.len() <= 384 {
        // This child uses only our bounded fixed diagnostic hook; do not emit
        // arbitrary child text during assertion handling.
        linuxcast_input_spike::diagnostics::stage("PRIVATE_SUITE_FAILED");
    }
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["helperCases"], 10);
    assert_eq!(report["noWorkerArm"], true);
    assert_eq!(report["liveQueries"], 0);
    assert_eq!(report["actualWrongRootParentRejected"], true);
    assert_eq!(report["rootBootstrapSchemaAndRightsChecked"], true);
    assert_eq!(report["rootExecutionUnavailable"], true);
    assert_eq!(report["actualRootDropProof"], false);
    // Exercise the real supervisor's distinct entry as an ordinary user. It
    // cannot fall back to synthetic bootstrap or start a worker without root.
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-supervisor"))
        .arg("--live-denial")
        .env_clear()
        .env("PRIVATE_CANARY", "PrivateRootEnvironmentCanary")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty() && output.stderr.len() <= 384);
    let denied: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(denied["code"], "ROOT_DENIAL_EMPTY_ENV_AND_ROOT_REQUIRED");
    assert!(!String::from_utf8_lossy(&output.stderr).contains("PrivateRootEnvironmentCanary"));
    abrupt(false);
    abrupt(true);
    unsafe {
        libc::alarm(0);
    }
    println!(
        "{{\"privateNoQueryFixture\":true,\"helperCases\":10,\"invocationPrivacy\":true,\"parentDeathCleanup\":true,\"independentSevenSecondGuard\":true,\"blockedGuardSignalsRejected\":true,\"noWorkerArm\":true,\"liveQueries\":0,\"actualWrongRootParentRejected\":true,\"rootBootstrapSchemaAndRightsChecked\":true,\"nonrootSupervisorEntryDenied\":true,\"rootExecutionUnavailable\":true,\"actualRootDropProof\":false}}"
    );
}

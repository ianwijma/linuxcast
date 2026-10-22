//! Standalone, single-threaded lifecycle fixture: never issues session/bus reads.
#[path = "../src/peer_observer.rs"]
#[allow(dead_code)]
mod peer_observer;
use peer_observer::Fixture;
use std::io::{BufRead, BufReader};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn command(case: &str) -> Command {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.arg(case).env_clear();
    command
}
fn checked_case(case: &str, complete: bool, deadline: bool, descendants: u64) {
    let output = command(case).output().unwrap();
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value.as_object().unwrap().len(), 7);
    assert_eq!(value["complete"], complete);
    assert_eq!(value["clientReaped"], true);
    assert_eq!(value["observerReaped"], true);
    assert_eq!(value["temporaryDirectoryRemoved"], true);
    assert_eq!(value["descendantsAbsent"], true);
    assert_eq!(value["deadlineTriggered"], deadline);
    assert_eq!(value["descendantsReaped"], descendants);
}
fn pidfd(pid: i32) -> OwnedFd {
    let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
    assert!(fd >= 0);
    unsafe { OwnedFd::from_raw_fd(fd as i32) }
}
fn abrupt_exit(hard_deadline: bool) {
    let started = Instant::now();
    let mut child = command(if hard_deadline {
        "--private-hard-deadline"
    } else {
        "--private-parent-death"
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .unwrap();
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    // These identities exist only on a captured private fixture pipe, in
    // memory. They are never logged or published as observation evidence.
    let value: serde_json::Value = serde_json::from_str(&ready).unwrap();
    assert_eq!(value["temporaryDirectoryRemoved"], true);
    let client = value["client"].as_i64().unwrap() as i32;
    let observer = value["observer"].as_i64().unwrap() as i32;
    let handles = [pidfd(client), pidfd(observer)];
    if !hard_deadline {
        child.kill().unwrap();
    }
    let status = child.wait().unwrap();
    if hard_deadline {
        assert_eq!(status.code(), Some(124));
        assert!(started.elapsed() >= Duration::from_secs(7));
        assert!(started.elapsed() <= Duration::from_millis(7250));
    }
    let mut died = [false; 2];
    let end = Instant::now() + Duration::from_millis(500);
    for (index, handle) in handles.iter().enumerate() {
        while Instant::now() < end {
            let mut poll = libc::pollfd {
                fd: handle.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            };
            if unsafe { libc::poll(&mut poll, 1, 0) } == 1 && poll.revents & libc::POLLIN != 0 {
                died[index] = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        // Cleanup uses the exact retained kernel handle even on a failed test.
        unsafe {
            libc::syscall(
                libc::SYS_pidfd_send_signal,
                handle.as_raw_fd(),
                libc::SIGKILL,
                0,
                0,
            )
        };
    }
    for pid in [client, observer] {
        unsafe { libc::waitpid(pid, std::ptr::null_mut(), 0) };
    }
    assert!(died.into_iter().all(|value| value));
}
fn invocation_privacy() {
    let output = Command::new(env!("CARGO_BIN_EXE_linuxcast-input-spike-peer-probe"))
        .args(["--pid", "1", "--socket", "/PrivateObserverCanary"])
        .env_clear()
        .env("SYSTEMD_LOG_LEVEL", "debug")
        .env(
            "DBUS_SYSTEM_BUS_ADDRESS",
            "unix:path=/PrivateObserverCanary",
        )
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let value: serde_json::Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(value["code"], "PRIVATE_PEER_INVOCATION_REQUIRED");
    assert!(
        !output
            .stderr
            .windows(b"PrivateObserverCanary".len())
            .any(|value| value == b"PrivateObserverCanary")
    );
}
fn main() {
    linuxcast_input_spike::diagnostics::panic_policy("PRIVATE_FIXTURE");
    // No test runner threads, global environment mutation or inherited bus/log
    // overrides while the shared fork/lifecycle code is exercised.
    assert_eq!(unsafe { libc::clearenv() }, 0);
    linuxcast_input_spike::unix::no_core().unwrap();
    assert_eq!(
        unsafe { libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) },
        0
    );
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() == 1 {
        let fixture = match args[0].as_str() {
            "--private-normal" => Fixture::Normal,
            "--private-connect-failure" => Fixture::ConnectFailure,
            "--private-cancelled" => Fixture::Cancelled,
            "--private-query-failure" => Fixture::QueryFailure,
            "--private-stalled-query" => Fixture::StalledQuery,
            "--private-descendant" => Fixture::Descendant,
            "--private-parent-death" => Fixture::ParentDeath,
            "--private-hard-deadline" => Fixture::HardDeadline,
            _ => std::process::exit(3),
        };
        let summary = peer_observer::run_fixture(fixture).unwrap();
        println!("{}", serde_json::to_string(&summary).unwrap());
        return;
    }
    assert!(args.is_empty());
    unsafe { libc::alarm(15) };
    invocation_privacy();
    checked_case("--private-normal", true, false, 0);
    checked_case("--private-connect-failure", false, false, 0);
    checked_case("--private-cancelled", false, false, 0);
    checked_case("--private-query-failure", false, false, 0);
    checked_case("--private-stalled-query", false, true, 0);
    checked_case("--private-descendant", true, false, 1);
    abrupt_exit(false);
    abrupt_exit(true);
    unsafe { libc::alarm(0) };
    println!(
        "{{\"privateNoQueryFixture\":true,\"normalCleanup\":true,\"queryFailureCleanup\":true,\"startupFailureCleanup\":true,\"cancellationCleanup\":true,\"deadlineCleanup\":true,\"retainedDescendantCleanup\":true,\"parentDeathCleanup\":true,\"fixedInvocationPrivacy\":true,\"independentSevenSecondDeadline\":true,\"liveQueries\":0}}"
    );
}

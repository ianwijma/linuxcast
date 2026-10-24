//! Fixed read-only engineering monitor. No input path or control operation.
use linuxcast_input_spike::{context::Monitor, diagnostics, fail};
use std::io::Write;
use std::time::{Duration, Instant};
fn run() -> linuxcast_input_spike::Result<()> {
    diagnostics::stage("CONTEXT_GUARD");
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--observe-own-session"] {
        return Err(fail("MONITOR_INVOCATION_REQUIRED"));
    }
    // Clear potentially inherited bus/logging overrides before any libsystemd
    // invocation or thread creation. The executable is never setuid/cap-enabled.
    if unsafe { libc::clearenv() } != 0 {
        return Err(fail("ENVIRONMENT_CLEAR_FAILED"));
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(7));
        // Overall fail-closed bound also covers unexpectedly stalled local
        // sd-login reads. Fixed bytes only; no panic/error payload formatting.
        let message = b"{\"component\":\"CONTEXT\",\"code\":\"MONITOR_DEADLINE\"}\n";
        unsafe {
            libc::write(libc::STDERR_FILENO, message.as_ptr().cast(), message.len());
            libc::_exit(3);
        }
    });
    diagnostics::stage("CONTEXT_MONITOR");
    let mut monitor = Monitor::own_session();
    let start = Instant::now();
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    for index in 0..20 {
        let report = monitor.observe();
        serde_json::to_writer(&mut output, &report)?;
        output.write_all(b"\n")?;
        output.flush()?;
        let next = Duration::from_millis((index + 1) * 250);
        std::thread::sleep(next.saturating_sub(start.elapsed()));
    }
    Ok(())
}
fn main() {
    diagnostics::panic_policy("CONTEXT");
    if let Err(error) = run() {
        diagnostics::emit("CONTEXT", error.as_ref());
        std::process::exit(3);
    }
}

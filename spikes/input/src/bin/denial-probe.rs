#[path = "../denial_observer.rs"]
#[allow(dead_code)]
mod denial_observer;
fn main() {
    use linuxcast_input_spike::{diagnostics, fail};
    diagnostics::panic_policy("DENIAL_PROBE");
    let result = (|| {
        if unsafe { libc::clearenv() } != 0 {
            return Err(fail("ENVIRONMENT_CLEAR_FAILED"));
        }
        denial_observer::initialize()?;
        if std::env::args().skip(1).collect::<Vec<_>>() != ["--observe-private-denial"] {
            return Err(fail("PRIVATE_DENIAL_INVOCATION_REQUIRED"));
        }
        denial_observer::driver()
    })();
    if let Err(error) = result {
        diagnostics::emit("DENIAL_PROBE", error.as_ref());
        std::process::exit(3);
    }
}

//! Dedicated private-peer engineering observer. No input/control operation.
#[path = "../peer_observer.rs"]
#[cfg_attr(test, allow(dead_code))]
mod peer_observer;

fn main() {
    use linuxcast_input_spike::{diagnostics, fail};
    diagnostics::panic_policy("PEER_PROBE");
    let result = (|| {
        // Dedicated single-threaded executable: clear before library work,
        // forks or any threads. The library never mutates global environment.
        if unsafe { libc::clearenv() } != 0 {
            return Err(fail("ENVIRONMENT_CLEAR_FAILED"));
        }
        peer_observer::initialize()?;
        if std::env::args().skip(1).collect::<Vec<_>>() != ["--observe-private-peer"] {
            return Err(fail("PRIVATE_PEER_INVOCATION_REQUIRED"));
        }
        peer_observer::run()
    })();
    if let Err(error) = result {
        diagnostics::emit("PEER_PROBE", error.as_ref());
        std::process::exit(3);
    }
}

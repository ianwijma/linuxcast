#[path = "../denial_observer.rs"]
#[allow(dead_code)]
mod denial_observer;
fn main() {
    use linuxcast_input_spike::{diagnostics, fail};
    diagnostics::panic_policy("DENIAL_HELPER");
    let result = (|| {
        // Strict empty-env launch contract, no environment mutation here.
        if std::env::args().skip(1).collect::<Vec<_>>() != ["--internal-denial"] {
            return Err(fail("PRIVATE_DENIAL_HELPER_REQUIRED"));
        }
        denial_observer::helper()
    })();
    if let Err(error) = result {
        diagnostics::emit("DENIAL_HELPER", error.as_ref());
        std::process::exit(3);
    }
}

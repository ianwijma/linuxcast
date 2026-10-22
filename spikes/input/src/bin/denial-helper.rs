#[path = "../denial_observer.rs"]
#[allow(dead_code)]
mod denial_observer;
fn main() {
    use linuxcast_input_spike::{diagnostics, fail};
    diagnostics::panic_policy("DENIAL_HELPER");
    // Strict empty-env launch contract, no environment mutation here.
    let result = match std::env::args().skip(1).collect::<Vec<_>>().as_slice() {
        [mode] if mode == "--internal-denial" => denial_observer::helper(),
        [mode] if mode == "--internal-root-denial" => denial_observer::root_helper(),
        _ => Err(fail("PRIVATE_DENIAL_HELPER_REQUIRED")),
    };
    if let Err(error) = result {
        diagnostics::emit("DENIAL_HELPER", error.as_ref());
        std::process::exit(3);
    }
}

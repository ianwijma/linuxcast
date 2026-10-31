//! Standalone build only. The coordinator owns production module/CLI wiring.
#[path = "../session.rs"]
mod session;
fn main() {
    if session::run_stdio().is_err() {
        std::process::exit(1);
    }
}

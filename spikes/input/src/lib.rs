//! S0-03 synthetic-device safety spike. Not an installable input service.
pub mod device;
pub mod diagnostics;
pub mod protocol;
pub mod safety;
pub mod unix;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub fn fail(code: &'static str) -> Box<dyn std::error::Error + Send + Sync> {
    Box::new(diagnostics::CodeFailure { code })
}

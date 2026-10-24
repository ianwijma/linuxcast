//! Only static allowlisted codes and numeric errno cross this boundary.
//! Error Display/Debug/source text is never formatted, even for IO/JSON errors.
use serde::Serialize;
use std::{cell::Cell, error::Error, fmt, io};
thread_local! {static STAGE:Cell<&'static str>=const{Cell::new("STARTUP")};}
pub fn stage(value: &'static str) {
    STAGE.set(safe_code(value));
}
fn safe_code(value: &'static str) -> &'static str {
    if !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|c| c.is_ascii_uppercase() || c == b'_')
    {
        value
    } else {
        "INVALID_FAILURE_CODE"
    }
}
#[derive(Debug)]
pub struct CodeFailure {
    pub code: &'static str,
}
impl fmt::Display for CodeFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(safe_code(self.code))
    }
}
impl Error for CodeFailure {}
#[derive(Debug, Serialize)]
pub struct Diagnostic {
    component: &'static str,
    stage: &'static str,
    code: &'static str,
    io_kind: Option<&'static str>,
    errno: Option<i32>,
}
pub fn classify(component: &'static str, error: &(dyn Error + 'static)) -> Diagnostic {
    let mut result = Diagnostic {
        component: safe_code(component),
        stage: STAGE.get(),
        code: "UNCLASSIFIED_FAILURE",
        io_kind: None,
        errno: None,
    };
    if let Some(error) = error.downcast_ref::<CodeFailure>() {
        result.code = safe_code(error.code);
    } else if let Some(error) = error.downcast_ref::<io::Error>() {
        result.code = "IO_FAILURE";
        result.io_kind = Some(match error.kind() {
            io::ErrorKind::NotFound => "NOT_FOUND",
            io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            io::ErrorKind::WouldBlock => "WOULD_BLOCK",
            io::ErrorKind::TimedOut => "TIMED_OUT",
            io::ErrorKind::Interrupted => "INTERRUPTED",
            io::ErrorKind::UnexpectedEof => "UNEXPECTED_EOF",
            io::ErrorKind::BrokenPipe => "BROKEN_PIPE",
            _ => "OTHER",
        });
        result.errno = error.raw_os_error().filter(|n| (1..=4095).contains(n));
    } else if error.downcast_ref::<serde_json::Error>().is_some() {
        result.code = "JSON_SCHEMA_FAILURE";
    }
    result
}
pub fn emit(component: &'static str, error: &(dyn Error + 'static)) {
    // These fields are bounded independently of any underlying error text.
    if let Ok(line) = serde_json::to_string(&classify(component, error))
        && line.len() <= 384
    {
        eprintln!("{line}");
    }
}
pub fn panic_policy(component: &'static str) {
    std::panic::set_hook(Box::new(move |_| {
        emit(component, &CodeFailure { code: "PANIC" })
    }));
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostics_never_format_private_error_text_or_paths() {
        stage("TEST");
        let seed = "PRIVATE_INPUT_CANARY_/home/user/private";
        let io = io::Error::new(io::ErrorKind::PermissionDenied, seed);
        let json = serde_json::from_str::<serde_json::Value>(seed).unwrap_err();
        let opaque = seed.to_owned();
        let errors: Vec<Box<dyn Error>> = vec![Box::new(io), Box::new(json), opaque.into()];
        for error in errors {
            let line = serde_json::to_string(&classify("TEST", error.as_ref())).unwrap();
            assert!(!line.contains(seed));
            assert!(!line.contains("/home"));
            assert!(line.len() < 384);
        }
        let native = classify("WORKER", &io::Error::from_raw_os_error(libc::EACCES));
        assert_eq!(native.errno, Some(libc::EACCES));
        assert_eq!(native.io_kind, Some("PERMISSION_DENIED"));
        assert_eq!(
            classify(
                "TEST",
                &CodeFailure {
                    code: "PRIVATE /secret"
                }
            )
            .code,
            "INVALID_FAILURE_CODE"
        );
    }
}

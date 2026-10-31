fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments == ["dictionary-spell"] {
        if linuxcast_platform::dictionary_spelling::run_stdio().is_err() {
            eprintln!("PLATFORM_SPELLING_UNAVAILABLE");
            std::process::exit(1);
        }
        return;
    }
    if arguments == ["applications"] {
        if linuxcast_platform::applications::run_stdio().is_err() {
            eprintln!("PLATFORM_APPLICATIONS_UNAVAILABLE");
            std::process::exit(1);
        }
        return;
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    if arguments == ["credential-session"] {
        let code = if linuxcast_platform::credential_session::run_stdio().is_ok() {
            0
        } else {
            1
        };
        std::process::exit(code);
    }
    if arguments != ["index"] {
        eprintln!("PLATFORM_INVALID_OPERATION");
        std::process::exit(2);
    }
    if linuxcast_platform::index::run_stdio().is_err() {
        eprintln!("PLATFORM_INDEX_UNAVAILABLE");
        std::process::exit(1);
    }
}

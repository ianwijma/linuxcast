fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments != ["index"] {
        eprintln!("PLATFORM_INVALID_OPERATION");
        std::process::exit(2);
    }
    if linuxcast_platform::index::run_stdio().is_err() {
        eprintln!("PLATFORM_INDEX_UNAVAILABLE");
        std::process::exit(1);
    }
}

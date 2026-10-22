use std::{env, path::PathBuf, process::Command};
fn main() {
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
    let flags = Command::new("pkg-config")
        .args(["--cflags", "libevdev"])
        .output()
        .expect("pkg-config required");
    assert!(flags.status.success(), "Debian libevdev-dev required");
    let object = out.join("boundary.o");
    let archive = out.join("libinput_spike_boundary.a");
    let status = Command::new("cc")
        .args([
            "-std=c11",
            "-O2",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-D_GNU_SOURCE",
        ])
        .args(String::from_utf8(flags.stdout).unwrap().split_whitespace())
        .args(["-c", "native/boundary.c", "-o"])
        .arg(&object)
        .status()
        .expect("C compiler required");
    assert!(status.success(), "native boundary compilation failed");
    assert!(
        Command::new("ar")
            .arg("crs")
            .arg(&archive)
            .arg(&object)
            .status()
            .expect("ar required")
            .success()
    );
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=input_spike_boundary");
    println!("cargo:rustc-link-lib=evdev");
    println!("cargo:rerun-if-changed=native/boundary.c");
}

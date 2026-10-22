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
    let systemd_flags = Command::new("pkg-config")
        .args(["--cflags", "libsystemd"])
        .output()
        .expect("pkg-config required");
    assert!(
        systemd_flags.status.success(),
        "Debian libsystemd-dev required"
    );
    let flags = String::from_utf8(systemd_flags.stdout).unwrap();
    let context_object = out.join("context.o");
    assert!(
        Command::new("cc")
            .args([
                "-std=c11",
                "-O2",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-D_GNU_SOURCE"
            ])
            .args(flags.split_whitespace())
            .args(["-c", "native/context.c", "-o"])
            .arg(&context_object)
            .status()
            .expect("C compiler required")
            .success(),
        "context bridge compilation failed"
    );
    assert!(
        Command::new("ar")
            .arg("crs")
            .arg(&archive)
            .arg(&context_object)
            .status()
            .expect("ar required")
            .success()
    );
    // Separate private-fixture executable, never part of a production binary.
    let fixture = out.join("context-private-fixture");
    assert!(
        Command::new("cc")
            .args([
                "-std=c11",
                "-O2",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-D_GNU_SOURCE"
            ])
            .args(flags.split_whitespace())
            .args(["native/context-fixture.c", "-lsystemd", "-o"])
            .arg(&fixture)
            .status()
            .expect("C compiler required")
            .success(),
        "context fixture compilation failed"
    );
    println!(
        "cargo:rustc-env=LINUXCAST_CONTEXT_PRIVATE_FIXTURE={}",
        fixture.display()
    );
    let peer_fixture = out.join("context-peer-fixture");
    assert!(
        Command::new("cc")
            .args([
                "-std=c11",
                "-O2",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-D_GNU_SOURCE"
            ])
            .args(flags.split_whitespace())
            .args(["native/peer-fixture.c", "-lsystemd", "-o"])
            .arg(&peer_fixture)
            .status()
            .expect("C compiler required")
            .success(),
        "peer fixture compilation failed"
    );
    println!(
        "cargo:rustc-env=LINUXCAST_CONTEXT_PEER_FIXTURE={}",
        peer_fixture.display()
    );
    println!("cargo:rerun-if-changed=native/peer-context.c");
    println!("cargo:rerun-if-changed=native/peer-fixture.c");
    println!("cargo:rustc-link-lib=systemd");
    println!("cargo:rerun-if-changed=native/context.c");
    println!("cargo:rerun-if-changed=native/context.h");
    println!("cargo:rerun-if-changed=native/context-fixture.c");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=input_spike_boundary");
    println!("cargo:rustc-link-lib=evdev");
    println!("cargo:rerun-if-changed=native/boundary.c");
}

use linuxcast_input_spike::{
    Result, device, fail,
    protocol::{Decoder, Operation, Reply},
    safety::{Context, Guard, WORKER_WATCHDOG_MS},
    unix::{self, Boot, Internal},
};
use std::{
    fs,
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd},
        unix::{
            fs::{MetadataExt, PermissionsExt},
            net::{UnixListener, UnixStream},
            process::CommandExt,
        },
    },
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};

struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
struct SocketCleanup(String);
struct Connection {
    stream: UnixStream,
    decoder: Decoder,
    handshake: bool,
    window: u64,
    requests: u32,
    connected: u64,
    partial: Option<u64>,
}
impl Drop for SocketCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn reply(stream: &mut UnixStream, generation: u64, state: &str, reason: &str) -> Result<()> {
    let bytes = linuxcast_input_spike::protocol::frame(&Reply {
        version: 1,
        generation,
        state: state.into(),
        reason: reason.into(),
    })?;
    // Nonblocking, bounded output. A slow/missing client disarms; no buffer grows.
    stream.write_all(&bytes)?;
    Ok(())
}
fn run() -> Result<()> {
    if std::env::args().collect::<Vec<_>>()
        != [std::env::args().next().unwrap(), "--synthetic-lab".into()]
        || unsafe { libc::getuid() } != 0
    {
        return Err(fail("SYNTHETIC_LAB_ROOT_ONLY"));
    }
    unix::no_core()?;
    device::silence();
    let lab = unsafe { OwnedFd::from_raw_fd(3) };
    let peer = unix::peer(lab.as_raw_fd())?;
    if peer.uid != 0 {
        return Err(fail("LAB_ROOT_PEER_REQUIRED"));
    }
    unix::parent_death(peer.pid as u32)?;
    let (mut boot, descriptors) = unix::wait_receive::<Boot>(lab.as_raw_fd(), 2, 2000)?;
    if boot.worker_uid == 0
        || boot.worker_uid == boot.client_uid
        || boot.worker_gid == 0
        || !boot
            .source_phys
            .starts_with("linuxcast-s0-03/manufactured-")
        || boot.source_phys.len() > 128
        || !boot.socket_path.starts_with("/run/linuxcast-input-spike/")
        || boot.socket_path.len() > 100
    {
        return Err(fail("LAB_BOOT_DENIED"));
    }
    device::validate(&descriptors[0], &boot.source_phys)?;
    let path = PathBuf::from(&boot.socket_path);
    let directory = path.parent().ok_or_else(|| fail("BAD_SOCKET_DIRECTORY"))?;
    let meta = fs::symlink_metadata(directory)?;
    if !meta.is_dir() || meta.uid() != 0 || meta.mode() & 0o022 != 0 {
        return Err(fail("UNSAFE_RUNTIME_DIRECTORY"));
    }
    let listener = UnixListener::bind(&path)?;
    let _cleanup = SocketCleanup(boot.socket_path.clone());
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    let socket = std::ffi::CString::new(boot.socket_path.clone())?;
    if unsafe { libc::chown(socket.as_ptr(), boot.client_uid, boot.client_uid) } != 0 {
        return Err(fail("SOCKET_OWNER_FAILED"));
    }
    listener.set_nonblocking(true)?;
    let executable = std::env::current_exe()?.with_file_name("linuxcast-input-spike-worker");
    let meta = fs::symlink_metadata(&executable)?;
    if !meta.is_file() || meta.uid() != 0 || meta.mode() & 0o022 != 0 {
        return Err(fail("WORKER_BINARY_NOT_ROOT_OWNED"));
    }
    device::supervisor_caps()?;
    let (control, child_control) = unix::pair()?;
    let child_fd = child_control.as_raw_fd();
    let uid = boot.worker_uid;
    let gid = boot.worker_gid;
    let mut command = Command::new(executable);
    command
        .arg("--internal")
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        command.pre_exec(move || {
            if libc::setgroups(0, std::ptr::null()) != 0
                || libc::setgid(gid) != 0
                || libc::setuid(uid) != 0
            {
                return Err(std::io::Error::last_os_error());
            }
            if libc::dup2(child_fd, 3) < 0 || libc::fcntl(3, libc::F_SETFD, 0) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            // Every other inherited descriptor is CLOEXEC, including lab/control,
            // listener, devices and Rust process-spawn error pipe.
            Ok(())
        });
    }
    let mut child = ChildGuard(command.spawn()?);
    drop(child_control);
    boot.parent = unsafe { libc::getpid() } as u32;
    unix::send(
        control.as_raw_fd(),
        &boot,
        &descriptors
            .iter()
            .map(AsRawFd::as_raw_fd)
            .collect::<Vec<_>>(),
    )?;
    // Critical invariant: no supervisor recovery duplicate survives handoff.
    drop(descriptors);
    let (ready, _) = unix::wait_receive::<Internal>(control.as_raw_fd(), 0, 3000)?;
    if !matches!(ready, Internal::Ready { .. }) {
        return Err(fail("WORKER_NOT_READY"));
    }
    unix::send(lab.as_raw_fd(), &ready, &[])?;
    let mut guard = Guard::default();
    let mut context: Option<Context> = None;
    let mut last_heartbeat = unix::monotonic_ms();
    // connection deadline, independent rate window, and partial-frame deadline
    let mut client: Option<Connection> = None;
    let mut armed = false;
    let mut arming = false;
    let reason = loop {
        let now = unix::monotonic_ms();
        if child.0.try_wait()?.is_some() {
            break "WORKER_EXITED";
        }
        if now.saturating_sub(last_heartbeat) >= WORKER_WATCHDOG_MS {
            break "WORKER_WATCHDOG";
        }
        if guard.armed
            && (!guard.valid(guard.generation, now)
                || !context.as_ref().is_some_and(|c| {
                    c.generation == guard.generation && c.eligible(boot.client_uid, now)
                }))
        {
            break "LEASE_OR_CONTEXT_EXPIRED";
        }
        match unix::receive::<Internal>(lab.as_raw_fd(), 0) {
            Ok(Some((Internal::Context { context: c }, _))) => {
                if guard.armed
                    && (c.generation != guard.generation || !c.eligible(boot.client_uid, now))
                {
                    break "CONTEXT_REVOKED";
                }
                context = Some(c);
            }
            Ok(None) => {}
            _ => break "LAB_CONTEXT_DISCONNECTED",
        }
        match unix::receive::<Internal>(control.as_raw_fd(), 0) {
            Ok(Some((Internal::Heartbeat, _))) => {
                last_heartbeat = now;
                // Operational-only observation lets the synthetic watchdog
                // experiment stop immediately after a fresh heartbeat.
                unix::send(lab.as_raw_fd(), &Internal::Heartbeat, &[])?;
            }
            Ok(Some((Internal::Armed, _))) if arming => {
                armed = true;
                arming = false;
            }
            Ok(Some((Internal::Stopped { .. }, _))) => break "WORKER_DISARMED",
            Ok(None) => {}
            _ => break "WORKER_PROTOCOL_OR_DISCONNECT",
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(true)?;
                let identity = unix::peer(stream.as_raw_fd())?;
                if identity.uid != boot.client_uid || client.is_some() {
                    let _ = reply(
                        &mut stream,
                        context.as_ref().map_or(1, |c| c.generation),
                        "denied",
                        "PEER_UID_OR_BUSY",
                    );
                } else {
                    client = Some(Connection {
                        stream,
                        decoder: Decoder::default(),
                        handshake: false,
                        window: now,
                        requests: 0,
                        connected: now,
                        partial: None,
                    });
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break "CONTROL_ACCEPT_FAILED",
        }
        if let Some(Connection {
            stream,
            decoder,
            handshake,
            window,
            requests,
            connected,
            partial,
        }) = &mut client
        {
            if (!*handshake && now.saturating_sub(*connected) >= 1000)
                || partial.is_some_and(|started| now.saturating_sub(started) >= 1000)
            {
                break "CONTROL_DEADLINE";
            }
            if now.saturating_sub(*window) >= 1000 {
                *window = now;
                *requests = 0;
            }
            let mut bytes = [0u8; 1028];
            match stream.read(&mut bytes) {
                Ok(0) => break "CLIENT_DISCONNECTED",
                Ok(n) => {
                    if decoder.is_empty() {
                        *partial = Some(now);
                    }
                    *requests += 1;
                    if *requests > 32 {
                        break "CONTROL_RATE_BOUND";
                    }
                    match decoder.feed(&bytes[..n]) {
                        Ok(Some(request)) => {
                            *partial = None;
                            let eligible = context.as_ref().is_some_and(|c| {
                                c.eligible(boot.client_uid, now)
                                    && c.generation == request.generation
                            });
                            let mut reason = "READY";
                            match request.operation {
                                Operation::Handshake if !*handshake && eligible => {
                                    *handshake = true;
                                }
                                Operation::Status if *handshake && eligible => {}
                                Operation::Arm
                                    if *handshake
                                        && guard.arm(request.generation, now, eligible, true) =>
                                {
                                    unix::send(
                                        control.as_raw_fd(),
                                        &Internal::Arm {
                                            generation: request.generation,
                                            lease_until: guard.lease_until,
                                        },
                                        &[],
                                    )?;
                                    arming = true;
                                }
                                Operation::Renew
                                    if *handshake
                                        && guard.renew(request.generation, now, eligible) =>
                                {
                                    unix::send(
                                        control.as_raw_fd(),
                                        &Internal::Renew {
                                            generation: request.generation,
                                            lease_until: guard.lease_until,
                                        },
                                        &[],
                                    )?;
                                }
                                Operation::Disarm if *handshake => break "EXPLICIT_DISARM",
                                _ => {
                                    if armed || arming || guard.terminal {
                                        break "CONTROL_CONTEXT_DENIED_DISARM";
                                    }
                                    reason = "CONTEXT_OR_CONTROL_DENIED";
                                }
                            }
                            if reply(
                                stream,
                                request.generation,
                                if armed {
                                    "armed"
                                } else if arming {
                                    "arming"
                                } else {
                                    "dormant"
                                },
                                reason,
                            )
                            .is_err()
                            {
                                break "CONTROL_WRITE_FAILED";
                            }
                        }
                        Ok(None) => {}
                        Err(_) => break "MALFORMED_CONTROL",
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break "CONTROL_READ_FAILED",
            }
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    guard.disarm();
    let cooperative = matches!(
        reason,
        "EXPLICIT_DISARM"
            | "CLIENT_DISCONNECTED"
            | "LEASE_OR_CONTEXT_EXPIRED"
            | "CONTEXT_REVOKED"
            | "CONTROL_CONTEXT_DENIED_DISARM"
    );
    // An expired500ms watchdog is already the last safety deadline: do not
    // add a grace period for a stopped/nonresponsive worker.
    if cooperative {
        let _ = unix::send(control.as_raw_fd(), &Internal::Disarm, &[]);
        let end = unix::monotonic_ms() + 100;
        while unix::monotonic_ms() < end {
            if child.0.try_wait()?.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    }
    // The supervisor never respawns/regrabs. Drop kills any noncooperative
    // worker, then wait reaps it before this process reports terminal state.
    drop(child);
    let _ = unix::send(
        lab.as_raw_fd(),
        &Internal::Stopped {
            reason: reason.into(),
        },
        &[],
    );
    Ok(())
}
fn main() {
    if run().is_err() {
        eprintln!("INPUT_SUPERVISOR_UNAVAILABLE");
        std::process::exit(3);
    }
}

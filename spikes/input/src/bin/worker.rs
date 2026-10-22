use linuxcast_input_spike::{
    Result,
    device::{self, Device},
    fail,
    safety::Emergency,
    unix::{self, Boot, Internal},
};
use std::{
    os::fd::{AsRawFd, FromRawFd, OwnedFd},
    time::Duration,
};

fn run() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("--policy-probe") {
        unix::no_core()?;
        if !device::empty_caps() {
            return Err(fail("CAPABILITIES_PRESENT"));
        }
        device::worker_policy()?;
        if !device::policy_probe() {
            return Err(fail("SYSCALL_POLICY_FAILED"));
        }
        println!(
            "{{\"emptyCapabilities\":true,\"noCore\":true,\"postInitPolicy\":true,\"fileSocketExecCloneDenied\":true}}"
        );
        return Ok(());
    }
    if std::env::args().collect::<Vec<_>>()
        != [std::env::args().next().unwrap(), "--internal".into()]
    {
        return Err(fail("INTERNAL_ONLY"));
    }
    unix::no_core()?;
    device::silence();
    if unsafe { libc::getuid() } == 0 || !device::empty_caps() {
        return Err(fail("WORKER_IDENTITY_UNSAFE"));
    }
    // FD3 is the fixed root-supervisor-owned internal socket, never a client path.
    let control = unsafe { OwnedFd::from_raw_fd(3) };
    let peer = unix::peer(control.as_raw_fd())?;
    if peer.uid != 0 {
        return Err(fail("WRONG_SUPERVISOR_UID"));
    }
    let (boot, mut descriptors) = unix::wait_receive::<Boot>(control.as_raw_fd(), 2, 2000)?;
    if boot.parent != peer.pid as u32 || boot.worker_uid != unsafe { libc::getuid() } {
        return Err(fail("BOOT_IDENTITY_MISMATCH"));
    }
    unix::parent_death(boot.parent)?;
    let output = descriptors.pop().ok_or_else(|| fail("NO_UINPUT"))?;
    let input = descriptors.pop().ok_or_else(|| fail("NO_EVDEV"))?;
    device::validate(&input, &boot.source_phys)?;
    let device = Device::new(input, output)?;
    let node = device.node()?;
    // All library initialization and sysfs discovery has finished. No future
    // program/file/socket creation is permitted, including in dormant state.
    device::worker_policy()?;
    unix::send(
        control.as_raw_fd(),
        &Internal::Ready {
            worker_pid: unsafe { libc::getpid() } as u32,
            virtual_node: node,
        },
        &[],
    )?;
    let mut armed = false;
    let mut generation = 0;
    let mut lease_until = 0;
    let mut heartbeat = 0;
    let mut emergency = Emergency::default();
    let reason = loop {
        let now = unix::monotonic_ms();
        if now.saturating_sub(heartbeat) >= 100 {
            if unix::send(control.as_raw_fd(), &Internal::Heartbeat, &[]).is_err() {
                break "SUPERVISOR_DISCONNECTED";
            }
            heartbeat = now;
        }
        // One packet per tick, no queue; expiry is checked independently.
        match unix::receive::<Internal>(control.as_raw_fd(), 0) {
            Ok(Some((
                Internal::Arm {
                    generation: g,
                    lease_until: until,
                },
                _,
            ))) if !armed => {
                if g == 0 || until <= now || until > now + 1000 || !device.all_released() {
                    break "ARM_DENIED";
                }
                if device.grab().is_err() {
                    break "GRAB_DENIED";
                }
                // The barrier is after the grab: legacy completed presses in
                // either queue are discarded, never replayed into the virtual
                // device. An ambiguous/nonempty bound fails closed.
                if device.discard_backlog().is_err() || !device.all_released() {
                    break "PREARM_BACKLOG_OR_HELD_DISARM";
                }
                generation = g;
                lease_until = until;
                armed = true;
                if unix::send(control.as_raw_fd(), &Internal::Armed, &[]).is_err() {
                    break "SUPERVISOR_DISCONNECTED";
                }
            }
            Ok(Some((
                Internal::Renew {
                    generation: g,
                    lease_until: until,
                },
                _,
            ))) => {
                if !armed
                    || generation != g
                    || now >= lease_until
                    || until <= now
                    || until > now + 1000
                {
                    break "STALE_LEASE";
                }
                lease_until = until;
            }
            Ok(Some((Internal::Disarm, _))) => break "EXPLICIT_DISARM",
            Ok(Some(_)) => break "INTERNAL_PROTOCOL_DENIED",
            Err(_) => break "SUPERVISOR_DISCONNECTED",
            Ok(None) => {}
        }
        if armed && now >= lease_until {
            break "APP_LEASE_EXPIRED";
        }
        // At most64 events per tick; no input burst can starve lease/control.
        if armed {
            let mut failure = None;
            for _ in 0..64 {
                match device.next() {
                    Ok(Some(event)) => {
                        if emergency.event(event.type_, event.code, event.value) {
                            failure = Some("EMERGENCY_DISARM");
                            break;
                        }
                        if device.forward(&event).is_err() {
                            failure = Some("FORWARD_FAILED");
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(_) => {
                        failure = Some("DEVICE_SYNC_OR_READ_DISARM");
                        break;
                    }
                }
            }
            if let Some(code) = failure {
                break code;
            }
        } else if device.discard_backlog().is_err() {
            break "DORMANT_BACKLOG_DISARM";
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    // Orderly path releases emitted keys, ungrabs, destroys virtual device,
    // then closes both owned descriptors. SIGKILL relies on kernel closure.
    drop(device);
    let _ = unix::send(
        control.as_raw_fd(),
        &Internal::Stopped {
            reason: reason.into(),
        },
        &[],
    );
    Ok(())
}
fn main() {
    if run().is_err() {
        eprintln!("INPUT_WORKER_UNAVAILABLE");
        std::process::exit(3);
    }
}

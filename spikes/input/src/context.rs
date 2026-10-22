//! Monitor-only observations. This module exposes no device or Arm operation.
use serde::Serialize;
use std::ffi::c_void;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;

#[repr(C)]
#[derive(Default, Clone, Copy, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeObservation {
    pub(crate) epoch: u64,
    pub(crate) started_ms: u64,
    pub(crate) observed_ms: u64,
    pub(crate) flags: u32,
    pub(crate) status: u32,
}
unsafe extern "C" {
    fn lc_context_open(out: *mut NativeObservation) -> *mut c_void;
    fn lc_context_sample(context: *mut c_void, out: *mut NativeObservation);
    fn lc_context_open_peer(
        socket: libc::c_int,
        expected_uid: u32,
        out: *mut NativeObservation,
    ) -> *mut c_void;
    fn lc_context_sample_peer(context: *mut c_void, out: *mut NativeObservation);
    fn lc_context_close(context: *mut c_void);
}
const PID_BOUND: u32 = 1;
const UID_MATCHED: u32 = 2;
const ACTIVE: u32 = 4;
const LOCAL: u32 = 8;
const GRAPHICAL: u32 = 16;
const USER_CLASS: u32 = 32;
const SEAT0: u32 = 64;
const HINT_KNOWN: u32 = 128;
const HINT_LOCKED: u32 = 256;
const OWNER_ROOT: u32 = 512;
const KNOWN_FLAGS: u32 = 1023;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Denial {
    NoBoundSession,
    UidMismatch,
    BusUnavailable,
    QueryUnavailable,
    OwnerUntrusted,
    ContextInvalidated,
    QueryDeadline,
    MalformedObservation,
    MessageFlood,
    PeerPidfdUnavailable,
    PeerDead,
    PeerDisconnected,
    PeerBindingInvalid,
    PeerSessionUnsupported,
    PeerSessionChanged,
    EnvironmentUntrusted,
    SnapshotStale,
    Inactive,
    Remote,
    NotGraphical,
    NotUserSession,
    NotSeatZero,
    LogindLocked,
    CompanionUnavailable,
    UnknownLock,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub monitor_only: bool,
    pub can_arm: bool,
    pub companion_available: bool,
    pub lock_known: bool,
    pub generation: u64,
    pub observed_ms: u64,
    pub query_elapsed_ms: u64,
    pub snapshot_fresh: bool,
    pub pid_session_bound: bool,
    pub uid_matched: bool,
    pub logind_owner_root: bool,
    pub active: bool,
    pub local: bool,
    pub graphical: bool,
    pub user_session: bool,
    pub seat_zero: bool,
    pub logind_lock_hint_known: bool,
    pub logind_lock_hint_locked: bool,
    pub denials: Vec<Denial>,
}
pub(crate) fn report(value: NativeObservation, now_ms: u64) -> Report {
    let valid = value.status == 0 && value.flags & !KNOWN_FLAGS == 0;
    let fresh = valid
        && value.started_ms <= value.observed_ms
        && value.observed_ms <= now_ms
        && now_ms - value.started_ms <= 1000
        && value.observed_ms - value.started_ms <= 250;
    let flag = |bit| fresh && value.flags & bit != 0;
    let mut denials = Vec::new();
    match value.status {
        0 => {}
        1 => denials.push(Denial::NoBoundSession),
        2 => denials.push(Denial::UidMismatch),
        3 => denials.push(Denial::BusUnavailable),
        4 => denials.push(Denial::QueryUnavailable),
        5 => denials.push(Denial::OwnerUntrusted),
        6 => denials.push(Denial::ContextInvalidated),
        7 => denials.push(Denial::QueryDeadline),
        8 => denials.push(Denial::MalformedObservation),
        9 => denials.push(Denial::MessageFlood),
        10 => denials.push(Denial::PeerPidfdUnavailable),
        11 => denials.push(Denial::PeerDead),
        12 => denials.push(Denial::PeerDisconnected),
        13 => denials.push(Denial::PeerBindingInvalid),
        14 => denials.push(Denial::PeerSessionUnsupported),
        15 => denials.push(Denial::PeerSessionChanged),
        16 => denials.push(Denial::EnvironmentUntrusted),
        _ => denials.push(Denial::MalformedObservation),
    }
    if !valid && value.status == 0 {
        denials.push(Denial::MalformedObservation);
    }
    if !fresh {
        denials.push(Denial::SnapshotStale);
    } else {
        for (bit, denial) in [
            (PID_BOUND, Denial::NoBoundSession),
            (UID_MATCHED, Denial::UidMismatch),
            (OWNER_ROOT, Denial::OwnerUntrusted),
            (ACTIVE, Denial::Inactive),
            (LOCAL, Denial::Remote),
            (GRAPHICAL, Denial::NotGraphical),
            (USER_CLASS, Denial::NotUserSession),
            (SEAT0, Denial::NotSeatZero),
        ] {
            if !flag(bit) {
                denials.push(denial);
            }
        }
        if flag(HINT_KNOWN) && flag(HINT_LOCKED) {
            denials.push(Denial::LogindLocked);
        }
    }
    // Even a root logind LockedHint=false is not authenticated companion proof.
    // No input grant or positive lock state exists in this monitor-only phase.
    denials.push(Denial::CompanionUnavailable);
    denials.push(Denial::UnknownLock);
    Report {
        monitor_only: true,
        can_arm: false,
        companion_available: false,
        lock_known: false,
        generation: value.epoch,
        observed_ms: value.observed_ms,
        query_elapsed_ms: value.observed_ms.saturating_sub(value.started_ms),
        snapshot_fresh: fresh,
        pid_session_bound: flag(PID_BOUND),
        uid_matched: flag(UID_MATCHED),
        logind_owner_root: flag(OWNER_ROOT),
        active: flag(ACTIVE),
        local: flag(LOCAL),
        graphical: flag(GRAPHICAL),
        user_session: flag(USER_CLASS),
        seat_zero: flag(SEAT0),
        logind_lock_hint_known: flag(HINT_KNOWN),
        logind_lock_hint_locked: flag(HINT_LOCKED),
        denials,
    }
}

pub struct Monitor {
    native: *mut c_void,
    unavailable: NativeObservation,
}
impl Monitor {
    /// Reads only this process's real UID/PID session. No claimed principal,
    /// environment-selected bus, device path, companion or control socket input.
    pub fn own_session() -> Self {
        let mut unavailable = NativeObservation::default();
        let native = unsafe { lc_context_open(&mut unavailable) };
        Self {
            native,
            unavailable,
        }
    }
    pub fn observe(&mut self) -> Report {
        let mut observation = self.unavailable;
        if !self.native.is_null() {
            unsafe { lc_context_sample(self.native, &mut observation) };
        }
        report(observation, crate::unix::monotonic_ms())
    }
}
impl Drop for Monitor {
    fn drop(&mut self) {
        unsafe { lc_context_close(self.native) };
    }
}

/// Metadata-only peer observation. It consumes an already accepted AF_UNIX
/// stream, owns its kernel-derived CLOEXEC peer pidfd and has no protocol/Arm,
/// client-provided FD/principal, or arbitrary PID/session constructor.
/// The expected UID MUST come from trusted server grant state, never a message.
/// Dedicated engineering observer only: launch with an empty environment before
/// library initialization and never mutate it. This API rejects any environment
/// entry before symbol resolution/session/bus work; it does not clear globals.
pub struct PeerMonitor {
    native: *mut c_void,
}
impl PeerMonitor {
    pub fn bind_connected(
        stream: UnixStream,
        trusted_expected_uid: u32,
    ) -> std::result::Result<Self, Denial> {
        let mut observation = NativeObservation::default();
        let native = unsafe {
            lc_context_open_peer(stream.as_raw_fd(), trusted_expected_uid, &mut observation)
        };
        // The native object retains only its own CLOEXEC metadata socket copy.
        // Consuming this transport prevents an unrelated socket replacing it.
        drop(stream);
        if native.is_null() {
            let mut denied = report(observation, crate::unix::monotonic_ms()).denials;
            return Err(denied.remove(0));
        }
        Ok(Self { native })
    }
    pub fn observe(&mut self) -> Report {
        let mut observation = NativeObservation::default();
        unsafe { lc_context_sample_peer(self.native, &mut observation) };
        report(observation, crate::unix::monotonic_ms())
    }
}
impl Drop for PeerMonitor {
    fn drop(&mut self) {
        unsafe { lc_context_close(self.native) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn unlocked() -> NativeObservation {
        NativeObservation {
            epoch: 4,
            started_ms: 100,
            observed_ms: 110,
            flags: KNOWN_FLAGS & !HINT_LOCKED,
            status: 0,
        }
    }
    #[test]
    fn root_unlocked_hint_never_grants_without_authenticated_companion() {
        let value = report(unlocked(), 110);
        assert!(value.snapshot_fresh && value.logind_owner_root && value.active);
        assert!(!value.can_arm && !value.lock_known && !value.companion_available);
        assert_eq!(
            value.denials,
            [Denial::CompanionUnavailable, Denial::UnknownLock]
        );
    }
    #[test]
    fn invalidation_timeout_unknown_flags_and_stale_sample_discard_all_eligibility() {
        for sample in [
            NativeObservation {
                status: 6,
                ..unlocked()
            },
            NativeObservation {
                status: 7,
                ..unlocked()
            },
            NativeObservation {
                flags: u32::MAX,
                ..unlocked()
            },
            NativeObservation {
                observed_ms: 351,
                ..unlocked()
            },
        ] {
            let value = report(sample, 351);
            assert!(!value.snapshot_fresh && !value.uid_matched && !value.active && !value.can_arm);
        }
        assert!(!report(unlocked(), 1101).snapshot_fresh);
        assert!(!report(unlocked(), 109).snapshot_fresh);
    }
    #[test]
    fn live_context_types_have_distinct_fixed_denials_and_no_private_fields() {
        let mut native = unlocked();
        native.flags &= !(ACTIVE | LOCAL | GRAPHICAL | USER_CLASS | SEAT0);
        native.flags |= HINT_LOCKED;
        let value = report(native, 110);
        for reason in [
            Denial::Inactive,
            Denial::Remote,
            Denial::NotGraphical,
            Denial::NotUserSession,
            Denial::NotSeatZero,
            Denial::LogindLocked,
        ] {
            assert!(value.denials.contains(&reason));
        }
        let json = serde_json::to_value(value).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 19);
        assert!(
            json.as_object()
                .unwrap()
                .values()
                .all(|v| v.is_boolean() || v.is_u64() || v.is_array())
        );
    }
}

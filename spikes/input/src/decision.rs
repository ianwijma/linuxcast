//! Shared supervisor decisions. Live evidence can veto, never grant input.
use crate::{
    protocol::Operation,
    safety::{Context, Guard},
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Veto {
    Pending,
    Remote,
    Inactive,
    NotGraphical,
    NotSeatZero,
    Locked,
    CompanionUnavailable,
    Unsupported,
    UnknownContext,
    Stale,
    Timeout,
    PeerDead,
    PeerDisconnected,
    EpochChanged,
    ChannelDisconnected,
    HelperExited,
    InvalidObservation,
    Terminal,
}
pub fn monitor_denial(value: &crate::context::Denial) -> Veto {
    use crate::context::Denial as D;
    match value {
        D::Remote => Veto::Remote,
        D::Inactive => Veto::Inactive,
        D::NotGraphical => Veto::NotGraphical,
        D::NotSeatZero => Veto::NotSeatZero,
        D::LogindLocked => Veto::Locked,
        D::PeerDead => Veto::PeerDead,
        D::PeerDisconnected => Veto::PeerDisconnected,
        D::SnapshotStale => Veto::Stale,
        D::QueryDeadline => Veto::Timeout,
        D::PeerSessionUnsupported | D::PeerPidfdUnavailable => Veto::Unsupported,
        D::ContextInvalidated | D::PeerSessionChanged => Veto::EpochChanged,
        D::CompanionUnavailable | D::UnknownLock => Veto::CompanionUnavailable,
        _ => Veto::UnknownContext,
    }
}
pub fn monitor_veto(report: &crate::context::Report) -> Veto {
    if !report.monitor_only || report.can_arm || report.companion_available || report.lock_known {
        Veto::InvalidObservation
    } else {
        report
            .denials
            .first()
            .map(monitor_denial)
            .unwrap_or(Veto::InvalidObservation)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Effect {
    None,
    Arm,
    Renew,
    Disarm,
}
#[derive(Debug)]
pub struct Outcome {
    pub effect: Effect,
    pub reason: &'static str,
    pub veto: Option<Veto>,
}
enum Policy {
    Synthetic,
    Live {
        connection: u64,
        veto: Veto,
        observed: Option<u64>,
        terminal: bool,
    },
}
pub struct DecisionState {
    guard: Guard,
    uid: u32,
    policy: Policy,
}
impl DecisionState {
    /// Only the existing root-only manufactured lab selects this policy.
    pub fn synthetic_lab(uid: u32) -> Self {
        Self {
            guard: Guard::default(),
            uid,
            policy: Policy::Synthetic,
        }
    }
    /// No armed-live constructor or positive observation exists.
    pub fn live_denial(uid: u32, connection: u64) -> Self {
        Self {
            guard: Guard::default(),
            uid,
            policy: Policy::Live {
                connection,
                veto: if connection == 0 {
                    Veto::InvalidObservation
                } else {
                    Veto::Pending
                },
                observed: None,
                terminal: connection == 0,
            },
        }
    }
    /// Trusted parent only, after validating its private helper channel.
    /// This operation can only select a veto; it never enables input.
    pub fn observation(&mut self, connection: u64, veto: Veto, observed: u64) {
        if let Policy::Live {
            connection: expected,
            veto: reason,
            observed: timestamp,
            terminal,
        } = &mut self.policy
        {
            if *terminal {
                return;
            }
            if connection != *expected {
                *terminal = true;
                *reason = Veto::InvalidObservation;
                self.guard.disarm();
            } else {
                *reason = veto;
                *timestamp = Some(observed);
            }
        }
    }
    pub fn invalidate(&mut self, cause: Veto) {
        if let Policy::Live { veto, terminal, .. } = &mut self.policy {
            if !*terminal {
                *veto = cause;
                *terminal = true;
            }
            self.guard.disarm();
        }
    }
    pub fn veto(&mut self, now: u64) -> Option<Veto> {
        if let Policy::Live {
            veto,
            observed,
            terminal,
            ..
        } = &mut self.policy
        {
            if !*terminal
                && observed.is_some_and(|t| t > now || now - t >= crate::safety::CONTEXT_MAX_AGE_MS)
            {
                *veto = Veto::Stale;
                *terminal = true;
                self.guard.disarm();
            }
            Some(*veto)
        } else {
            None
        }
    }
    pub fn is_armed(&self) -> bool {
        self.guard.armed
    }
    pub fn generation(&self) -> u64 {
        self.guard.generation
    }
    pub fn lease_until(&self) -> u64 {
        self.guard.lease_until
    }
    pub fn disarm(&mut self) {
        self.guard.disarm();
    }
    fn eligible(&self, context: Option<&Context>, generation: u64, now: u64) -> bool {
        context.is_some_and(|c| c.generation == generation && c.eligible(self.uid, now))
    }
    pub fn check_running(&mut self, context: Option<&Context>, now: u64) -> bool {
        // Also checks arming: Guard is armed when an Arm effect is emitted,
        // before the worker acknowledgement reaches the supervisor.
        if !self.guard.armed {
            return true;
        }
        if self.veto(now).is_some()
            || !self.guard.valid(self.guard.generation, now)
            || !self.eligible(context, self.guard.generation, now)
        {
            self.guard.disarm();
            false
        } else {
            true
        }
    }
    pub fn request(
        &mut self,
        operation: Operation,
        generation: u64,
        handshake: &mut bool,
        context: Option<&Context>,
        ready: bool,
        now: u64,
    ) -> Outcome {
        let eligible = self.eligible(context, generation, now);
        let mut effect = Effect::None;
        // Authentication remains distinct from an input grant. Legacy
        // Handshake/Status fixture semantics are preserved exactly.
        if matches!(operation, Operation::Arm | Operation::Renew)
            && let Some(veto) = self.veto(now)
        {
            self.invalidate(veto);
            return Outcome {
                effect: Effect::Disarm,
                reason: "LIVE_CONTEXT_VETO",
                veto: Some(veto),
            };
        }
        let accepted = match operation {
            Operation::Handshake if !*handshake && eligible => {
                *handshake = true;
                true
            }
            Operation::Status if *handshake && eligible => true,
            Operation::Arm if *handshake && self.guard.arm(generation, now, eligible, ready) => {
                effect = Effect::Arm;
                true
            }
            Operation::Renew if *handshake && self.guard.renew(generation, now, eligible) => {
                effect = Effect::Renew;
                true
            }
            Operation::Disarm if *handshake => {
                self.guard.disarm();
                return Outcome {
                    effect: Effect::Disarm,
                    reason: "EXPLICIT_DISARM",
                    veto: None,
                };
            }
            _ => false,
        };
        if !accepted && (self.guard.armed || self.guard.terminal) {
            effect = Effect::Disarm;
        }
        Outcome {
            effect,
            reason: if accepted {
                "READY"
            } else {
                "CONTEXT_OR_CONTROL_DENIED"
            },
            veto: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(now: u64) -> Context {
        Context {
            uid: 1000,
            seat: "seat0".into(),
            session_type: "wayland".into(),
            active: true,
            local: true,
            unlocked: Some(true),
            consented: true,
            generation: 7,
            observed_ms: now,
        }
    }
    #[test]
    fn synthetic_positive_lease_and_terminal_behavior_preserved() {
        let mut state = DecisionState::synthetic_lab(1000);
        let mut handshake = false;
        let context = fixture(100);
        assert_eq!(
            state
                .request(
                    Operation::Handshake,
                    7,
                    &mut handshake,
                    Some(&context),
                    true,
                    100
                )
                .effect,
            Effect::None
        );
        assert!(handshake);
        assert_eq!(
            state
                .request(Operation::Arm, 7, &mut handshake, Some(&context), true, 100)
                .effect,
            Effect::Arm
        );
        assert_eq!(state.lease_until(), 1100);
        assert_eq!(
            state
                .request(
                    Operation::Renew,
                    7,
                    &mut handshake,
                    Some(&context),
                    true,
                    200
                )
                .effect,
            Effect::Renew
        );
        assert_eq!(state.lease_until(), 1200);
        assert!(state.check_running(Some(&context), 999));
        assert!(!state.check_running(Some(&context), 1100));
        assert_eq!(
            state
                .request(
                    Operation::Arm,
                    7,
                    &mut handshake,
                    Some(&fixture(1101)),
                    true,
                    1101
                )
                .effect,
            Effect::Disarm
        );
    }
    #[test]
    fn live_negative_reason_is_consumed_and_never_overridden_by_eligible_fixture() {
        for cause in [
            Veto::Pending,
            Veto::Remote,
            Veto::Inactive,
            Veto::Locked,
            Veto::Stale,
            Veto::PeerDead,
            Veto::Timeout,
            Veto::ChannelDisconnected,
        ] {
            let mut state = DecisionState::live_denial(1000, 9);
            let mut handshake = true;
            state.observation(9, cause, 100);
            let denied = state.request(
                Operation::Arm,
                7,
                &mut handshake,
                Some(&fixture(100)),
                true,
                100,
            );
            assert_eq!(denied.effect, Effect::Disarm);
            assert_eq!(denied.veto, Some(cause));
            state.observation(9, Veto::CompanionUnavailable, 101);
            assert_eq!(
                state
                    .request(
                        Operation::Renew,
                        7,
                        &mut handshake,
                        Some(&fixture(101)),
                        true,
                        101
                    )
                    .veto,
                Some(cause)
            );
            assert!(!state.is_armed());
        }
    }
    #[test]
    fn running_live_state_vetoes_and_missing_stale_wrong_generation_fail_closed() {
        let mut state = DecisionState::live_denial(1000, 9);
        // Private unit seam only. No production armed-live constructor exists.
        assert!(state.guard.arm(7, 100, true, true));
        state.observation(9, Veto::Remote, 100);
        assert!(!state.check_running(Some(&fixture(100)), 100));
        assert!(!state.is_armed());
        let mut state = DecisionState::live_denial(1000, 9);
        assert_eq!(state.veto(100), Some(Veto::Pending));
        state.observation(9, Veto::Remote, 100);
        assert_eq!(state.veto(1100), Some(Veto::Stale));
        state.observation(9, Veto::Remote, 1101);
        assert_eq!(state.veto(1101), Some(Veto::Stale));
        let mut state = DecisionState::live_denial(1000, 9);
        state.observation(10, Veto::Remote, 100);
        assert_eq!(state.veto(100), Some(Veto::InvalidObservation));
    }
    #[test]
    fn actual_kernel_peer_private_bus_negative_reaches_shared_decision() {
        // Separate C executable, actual post-fork connect/pidfd, mocked session
        // and private sd-bus. It never opens the host/system/session bus.
        let output = std::process::Command::new(env!("LINUXCAST_CONTEXT_PEER_FIXTURE"))
            .arg("--denial-observation")
            .env_clear()
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(output.stderr.is_empty());
        let native: crate::context::NativeObservation =
            serde_json::from_slice(&output.stdout).unwrap();
        let observed = native.observed_ms;
        let report = crate::context::report(native, observed);
        assert!(
            report.snapshot_fresh
                && report.pid_session_bound
                && report.uid_matched
                && report.logind_owner_root
        );
        assert!(!report.local);
        assert!(report.denials.contains(&crate::context::Denial::Remote));
        let veto = monitor_veto(&report);
        assert_eq!(veto, Veto::Remote);
        let mut state = DecisionState::live_denial(1000, 1);
        state.observation(1, veto, observed);
        let mut handshake = true;
        let denied = state.request(
            Operation::Arm,
            7,
            &mut handshake,
            Some(&fixture(observed)),
            true,
            observed,
        );
        assert_eq!(denied.veto, Some(Veto::Remote));
        assert_eq!(denied.effect, Effect::Disarm);
        assert!(!state.is_armed());
    }
}

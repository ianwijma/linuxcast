use serde::{Deserialize, Serialize};

pub const APP_LEASE_MS: u64 = 1000;
pub const WORKER_WATCHDOG_MS: u64 = 500;
pub const CONTEXT_MAX_AGE_MS: u64 = 1000;

/// Root-side trusted context fixture, not client-supplied session evidence.
/// A production logind/desktop adapter is explicitly outside this spike.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Context {
    pub uid: u32,
    pub seat: String,
    pub session_type: String,
    pub active: bool,
    pub local: bool,
    pub unlocked: Option<bool>,
    pub consented: bool,
    pub generation: u64,
    pub observed_ms: u64,
}
impl Context {
    pub fn eligible(&self, authorized_uid: u32, now: u64) -> bool {
        self.uid == authorized_uid
            && self.seat == "seat0"
            && matches!(self.session_type.as_str(), "x11" | "wayland")
            && self.active
            && self.local
            && self.unlocked == Some(true)
            && self.consented
            && self.generation > 0
            && self.observed_ms <= now
            && now - self.observed_ms < CONTEXT_MAX_AGE_MS
    }
}

#[derive(Debug, Default)]
pub struct Guard {
    pub generation: u64,
    pub armed: bool,
    pub terminal: bool,
    pub lease_until: u64,
}
impl Guard {
    pub fn arm(&mut self, generation: u64, now: u64, eligible: bool, ready: bool) -> bool {
        if self.terminal || self.armed || !eligible || !ready || generation == 0 {
            return false;
        }
        self.generation = generation;
        self.lease_until = now.saturating_add(APP_LEASE_MS);
        self.armed = true;
        true
    }
    pub fn renew(&mut self, generation: u64, now: u64, eligible: bool) -> bool {
        if !self.armed
            || self.terminal
            || generation != self.generation
            || now >= self.lease_until
            || !eligible
        {
            self.disarm();
            return false;
        }
        self.lease_until = now.saturating_add(APP_LEASE_MS);
        true
    }
    pub fn valid(&self, generation: u64, now: u64) -> bool {
        self.armed && !self.terminal && generation == self.generation && now < self.lease_until
    }
    pub fn disarm(&mut self) {
        self.armed = false;
        self.terminal = true;
    }
}

/// Only the hardcoded chord is recognized; no matching buffer or text exists.
#[derive(Default)]
pub struct Emergency {
    left: bool,
    right: bool,
}
impl Emergency {
    pub fn event(&mut self, kind: u16, code: u16, value: i32) -> bool {
        if kind != 1 {
            return false;
        }
        if code == 29 && value != 2 {
            self.left = value == 1;
        }
        if code == 97 && value != 2 {
            self.right = value == 1;
        }
        code == 1 && value == 1 && self.left && self.right
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn context() -> Context {
        Context {
            uid: 1000,
            seat: "seat0".into(),
            session_type: "wayland".into(),
            active: true,
            local: true,
            unlocked: Some(true),
            consented: true,
            generation: 7,
            observed_ms: 100,
        }
    }
    #[test]
    fn session_denials_are_closed() {
        let base = context();
        assert!(base.eligible(1000, 999));
        let mut cases = Vec::new();
        let mut c = base.clone();
        c.active = false;
        cases.push(c);
        let mut c = base.clone();
        c.local = false;
        cases.push(c);
        let mut c = base.clone();
        c.unlocked = Some(false);
        cases.push(c);
        let mut c = base.clone();
        c.unlocked = None;
        cases.push(c);
        let mut c = base.clone();
        c.session_type = "tty".into();
        cases.push(c);
        let mut c = base.clone();
        c.session_type = "greeter".into();
        cases.push(c);
        let mut c = base.clone();
        c.uid = 1001;
        cases.push(c);
        let mut c = base.clone();
        c.seat = "seat1".into();
        cases.push(c);
        let mut c = base.clone();
        c.consented = false;
        cases.push(c);
        for c in cases {
            assert!(!c.eligible(1000, 200));
        }
        assert!(!base.eligible(1000, 1100));
        assert!(!base.eligible(1000, 99));
    }
    #[test]
    fn lease_boundary_generation_and_no_rearm() {
        let mut g = Guard::default();
        assert!(!g.arm(1, 0, false, true));
        assert!(!g.arm(1, 0, true, false));
        assert!(g.arm(7, 100, true, true));
        assert!(g.valid(7, 1099));
        assert!(!g.valid(7, 1100));
        assert!(!g.valid(6, 100));
        assert!(!g.renew(7, 1100, true));
        assert!(!g.arm(8, 1101, true, true));
    }
    #[test]
    fn chord_precedes_forwarding() {
        let mut e = Emergency::default();
        assert!(!e.event(1, 29, 1));
        assert!(!e.event(1, 1, 1));
        assert!(!e.event(1, 97, 1));
        assert!(e.event(1, 1, 1));
        assert!(!e.event(1, 29, 0));
        assert!(!e.event(1, 1, 1));
    }
}

use super::*;
unsafe extern "C" {
    fn g_variant_parse(
        kind: *const c_char,
        text: *const c_char,
        limit: *const c_char,
        end: *mut *const c_char,
        error: *mut P,
    ) -> P;
}
fn parsed(text: &str) -> Variant {
    let text = CString::new(text).unwrap();
    let mut error = ptr::null_mut();
    let v = unsafe {
        g_variant_parse(
            ptr::null(),
            text.as_ptr(),
            ptr::null(),
            ptr::null_mut(),
            &mut error,
        )
    };
    assert!(!v.is_null());
    assert!(error.is_null());
    Variant(v)
}
const GOOD: &str = include_str!("fixtures/eligible.gv");
#[test]
fn only_one_local_unix_bus_address_is_allowed() {
    for address in [
        c"unix:path=/tmp/private,guid=012345",
        c"unix:abstract=private",
    ] {
        assert!(local_bus_address(address));
    }
    for address in [
        c"tcp:host=localhost,port=1234",
        c"nonce-tcp:host=localhost,port=1234",
        c"autolaunch:",
        c"unix:path=/tmp/private;tcp:host=localhost",
        c"unix:path=relative",
    ] {
        assert!(!local_bus_address(address));
    }
}
#[test]
fn eligible_hint_and_explicit_denials() {
    assert_eq!(
        properties(&parsed(GOOD), 1000).unwrap(),
        Observation {
            active: true,
            locked: false,
            local: true,
            owner: true
        }
    );
    assert!(
        properties(
            &parsed(&GOOD.replace("'LockedHint': <false>", "'LockedHint': <true>")),
            1000
        )
        .unwrap()
        .locked
    );
    assert!(
        !properties(
            &parsed(&GOOD.replace("'Active': <true>", "'Active': <false>")),
            1000
        )
        .unwrap()
        .active
    );
    assert!(properties(&parsed(&GOOD.replace("wayland", "x11")), 1000).is_ok());
}
#[test]
fn foreign_remote_tty_greeter_are_never_observed() {
    assert_eq!(
        properties(&parsed(GOOD), 1001),
        Err(Failure::InvalidSession)
    );
    for text in [
        GOOD.replace("'Remote': <false>", "'Remote': <true>"),
        GOOD.replace("wayland", "tty"),
        GOOD.replace("'user'", "'greeter'"),
        GOOD.replace("'user'", "'user-early'"),
    ] {
        assert_eq!(
            properties(&parsed(&text), 1000),
            Err(Failure::InvalidSession)
        );
    }
}
#[test]
fn missing_wrong_types_duplicate_keys_and_idle_are_rejected() {
    for text in [
        GOOD.replace(", 'LockedHint': <false>", ""),
        GOOD.replace("'LockedHint': <false>", "'IdleHint': <false>"),
        GOOD.replace("'LockedHint': <false>", "'LockedHint': <'false'>"),
        GOOD.replace("'Active': <true>", "'Active': <uint32 1>"),
        GOOD.replace("uint32 1000", "uint64 1000"),
        GOOD.replace(
            "'LockedHint': <false>",
            "'LockedHint': <false>, 'LockedHint': <true>",
        ),
    ] {
        assert_eq!(
            properties(&parsed(&text), 1000),
            Err(Failure::InvalidResponse)
        );
    }
    assert_eq!(
        properties(&parsed("(true,)"), 1000),
        Err(Failure::InvalidResponse)
    );
}
#[test]
fn terminal_events_cannot_be_reopened_by_reordered_property_signals() {
    let events = Arc::new(Events::default());
    let owner = parsed("('org.freedesktop.login1', ':1.1', ':1.2')");
    let props = parsed("('org.freedesktop.login1.Session', @a{sv} {}, ['LockedHint'])");
    let mut data = CallbackData {
        events: events.clone(),
        session: None,
        kind: 1,
    };
    unsafe {
        on_signal(
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            owner.0,
            (&mut data as *mut CallbackData).cast(),
        );
    }
    data.kind = 2;
    unsafe {
        on_signal(
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            props.0,
            (&mut data as *mut CallbackData).cast(),
        );
    }
    assert_eq!(event_check(&events), Err(Failure::PeerChanged));
    assert_eq!(events.epoch.load(Ordering::SeqCst), 2);
}
#[test]
fn malformed_and_removal_signals_fail_closed() {
    for (kind, signature, expected) in [
        (2, "(true,)", Failure::InvalidResponse),
        (
            3,
            "('synthetic', objectpath '/org/freedesktop/login1/session/synthetic')",
            Failure::InvalidSession,
        ),
        (4, "(true,)", Failure::InvalidSession),
    ] {
        let events = Arc::new(Events::default());
        let params = parsed(signature);
        let mut data = CallbackData {
            events: events.clone(),
            session: Some(CString::new("/org/freedesktop/login1/session/synthetic").unwrap()),
            kind,
        };
        unsafe {
            on_signal(
                ptr::null_mut(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                params.0,
                (&mut data as *mut CallbackData).cast(),
            );
        }
        assert_eq!(event_check(&events), Err(expected));
    }
}

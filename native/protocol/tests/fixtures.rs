use linuxcast_protocol::{
    CapabilityStatus, Handshake, MAX_ENVELOPE_BYTES, RpcFailure, parse, parse_request, read_frame,
};
use serde::Deserialize;
use serde_json::Value;
use std::io::{self, Cursor, Read};

#[derive(Deserialize)]
struct Fixture {
    id: String,
    kind: String,
    json: String,
    valid: bool,
    expected: Option<serde_json::Map<String, Value>>,
}

#[test]
fn shared_typescript_fixtures() {
    let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
        "../../../packages/contracts/fixtures/protocol.json"
    ))
    .unwrap();
    assert!(!fixtures.is_empty());
    for f in fixtures {
        let result = match f.kind.as_str() {
            "capability" => parse::<CapabilityStatus>(f.json.as_bytes())
                .map(|v| serde_json::to_value(v).unwrap()),
            "handshake" => {
                parse::<Handshake>(f.json.as_bytes()).map(|v| serde_json::to_value(v).unwrap())
            }
            "failure" => {
                parse::<RpcFailure>(f.json.as_bytes()).map(|v| serde_json::to_value(v).unwrap())
            }
            "request" => parse_request(f.json.as_bytes(), |method, params| {
                method == "ping" && params.as_object().is_some_and(|p| p.is_empty())
            })
            .map(|v| serde_json::to_value(v).unwrap()),
            _ => panic!("unknown fixture kind"),
        };
        assert_eq!(result.is_ok(), f.valid, "fixture {}: {result:?}", f.id);
        if let Ok(output) = &result
            && let Some(expected) = f.expected
        {
            for (key, value) in expected {
                assert_eq!(output.get(&key), Some(&value), "fixture {} key {key}", f.id);
            }
        }
        if let Err(e) = result {
            assert_eq!(e.code, "invalid-request");
            assert!(!e.retryable);
        }
    }
}

#[test]
fn bounded_frames_and_nesting() {
    let payload = format!("\"{}\"", "x".repeat(MAX_ENVELOPE_BYTES - 2));
    let mut frame = (payload.len() as u32).to_be_bytes().to_vec();
    frame.extend(payload.as_bytes());
    let mut reader = Cursor::new(frame);
    assert_eq!(
        read_frame(&mut reader).unwrap().unwrap(),
        payload.as_bytes()
    );
    assert!(read_frame(&mut reader).unwrap().is_none());
    for bytes in [
        vec![0],
        vec![0, 0, 0, 2, b'{'],
        vec![0, 0, 0, 0],
        vec![0, 0, 0, 1, 255],
    ] {
        assert!(read_frame(&mut Cursor::new(bytes)).is_err());
    }
    for (depth, valid) in [(64, true), (65, false)] {
        let json = format!("{}0{}", "[".repeat(depth), "]".repeat(depth));
        assert_eq!(parse::<Value>(json.as_bytes()).is_ok(), valid);
    }
}

#[test]
fn oversized_header_never_requests_body_bytes() {
    struct HeaderOnly {
        header: Cursor<[u8; 4]>,
    }
    impl Read for HeaderOnly {
        fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
            assert!(
                self.header.position() < 4,
                "oversized body must not be read or allocated"
            );
            self.header.read(out)
        }
    }
    let mut reader = HeaderOnly {
        header: Cursor::new((MAX_ENVELOPE_BYTES as u32 + 1).to_be_bytes()),
    };
    assert!(read_frame(&mut reader).is_err());
}

use crate::{Result, fail};
use serde::{Deserialize, Serialize};

pub const MAX_FRAME: usize = 1024 * 1024;
// Fixed control operations need far less than the global protocol maximum.
pub const CONTROL_MAX: usize = 1024;
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u8,
    pub generation: u64,
    pub operation: Operation,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Operation {
    Handshake,
    Status,
    Arm,
    Renew,
    Disarm,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reply {
    pub version: u8,
    pub generation: u64,
    pub state: String,
    pub reason: String,
}

#[derive(Default)]
pub struct Decoder {
    buffer: Vec<u8>,
    wanted: Option<usize>,
}
impl Decoder {
    pub fn feed(&mut self, input: &[u8]) -> Result<Option<Request>> {
        if self.buffer.len().saturating_add(input.len()) > CONTROL_MAX + 4 {
            return Err(fail("CONTROL_BOUND"));
        }
        self.buffer.extend_from_slice(input);
        if self.wanted.is_none() && self.buffer.len() >= 4 {
            let n = u32::from_be_bytes(self.buffer[..4].try_into()?) as usize;
            if n == 0 || n > MAX_FRAME || n > CONTROL_MAX {
                return Err(fail("FRAME_BOUND"));
            }
            self.wanted = Some(n);
        }
        let Some(n) = self.wanted else {
            return Ok(None);
        };
        if self.buffer.len() < n + 4 {
            return Ok(None);
        }
        // One request at a time: pipelined bytes cannot grow an input queue.
        if self.buffer.len() != n + 4 {
            return Err(fail("NO_PIPELINING"));
        }
        let request: Request = serde_json::from_slice(&self.buffer[4..])?;
        self.buffer.clear();
        self.wanted = None;
        if request.version != 1 || request.generation == 0 {
            return Err(fail("PROTOCOL_MISMATCH"));
        }
        Ok(Some(request))
    }
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
}
pub fn frame<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.is_empty() || bytes.len() > CONTROL_MAX {
        return Err(fail("OUTPUT_BOUND"));
    }
    let mut frame = (bytes.len() as u32).to_be_bytes().to_vec();
    frame.extend(bytes);
    Ok(frame)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_fixed_frame_grammar() {
        let request = Request {
            version: 1,
            generation: 1,
            operation: Operation::Arm,
        };
        let bytes = frame(&request).unwrap();
        let mut d = Decoder::default();
        for b in &bytes[..bytes.len() - 1] {
            assert!(d.feed(&[*b]).unwrap().is_none());
        }
        assert!(matches!(
            d.feed(&bytes[bytes.len() - 1..])
                .unwrap()
                .unwrap()
                .operation,
            Operation::Arm
        ));
        for json in [
            r#"{"version":1,"generation":1,"operation":"inject"}"#,
            r#"{"version":1,"generation":1,"operation":"arm","uid":0}"#,
            r#"{"version":1,"generation":1,"operation":"arm","device":"/dev/input/event0"}"#,
            r#"{"version":2,"generation":1,"operation":"arm"}"#,
        ] {
            let mut bytes = (json.len() as u32).to_be_bytes().to_vec();
            bytes.extend(json.as_bytes());
            assert!(Decoder::default().feed(&bytes).is_err());
        }
        assert!(
            Decoder::default()
                .feed(&((MAX_FRAME + 1) as u32).to_be_bytes())
                .is_err()
        );
        let mut double = bytes.clone();
        double.extend(&bytes);
        assert!(Decoder::default().feed(&double).is_err());
    }
}

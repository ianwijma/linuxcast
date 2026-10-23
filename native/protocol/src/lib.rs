//! Provisional native mirror of packages/contracts/src/protocol.ts.
//! Framing is not authorization. Validate parameters against the registered method
//! before dispatch, associate principals independently, and handshake on reconnect.
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::io::Read;
mod json;
mod native;
pub use native::{
    EffectOutcome, NativeOperationEvent, NativeProgress, parse_native_operation_event,
};

pub const MAX_ENVELOPE_BYTES: usize = 1024 * 1024;
pub const MAX_JSON_DEPTH: usize = 64;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractError {
    pub code: &'static str,
    pub message: &'static str,
    pub retryable: bool,
}
impl ContractError {
    fn invalid(message: &'static str) -> Self {
        Self {
            code: "invalid-request",
            message,
            retryable: false,
        }
    }
}

// JSON has one number type. Accept integral exponent/decimal representations just
// as Zod does, while refusing fractional, negative and JS-unsafe integer values.
fn integer<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let number = f64::deserialize(d)?;
    if number.is_finite() && (0.0..=MAX_SAFE_INTEGER).contains(&number) && number.fract() == 0.0 {
        Ok(number as u64)
    } else {
        Err(serde::de::Error::custom("invalid integer"))
    }
}
fn version<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let version = integer(d)?;
    if version == 1 {
        Ok(version)
    } else {
        Err(serde::de::Error::custom("unknown version"))
    }
}
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}
fn optional_integer<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    integer(d).map(Some)
}
fn nullable_string<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityState {
    Available,
    PermissionRequired,
    ComponentRequired,
    Unsupported,
    TemporarilyUnavailable,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityStatus {
    pub id: String,
    pub state: CapabilityState,
    #[serde(deserialize_with = "nullable_string")]
    pub backend: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub reason_code: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub remediation_action: Option<String>,
    #[serde(deserialize_with = "integer")]
    pub generation: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Handshake {
    #[serde(deserialize_with = "version")]
    pub protocol_version: u64,
    pub component_build: String,
    pub supported_methods: Vec<String>,
    #[serde(deserialize_with = "integer")]
    pub capability_generation: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcRequest {
    #[serde(deserialize_with = "version")]
    pub protocol_version: u64,
    pub id: String,
    pub method: String,
    pub params: Value,
    #[serde(
        default,
        deserialize_with = "optional_integer",
        skip_serializing_if = "Option::is_none"
    )]
    pub deadline_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailureCode {
    InvalidRequest,
    PermissionDenied,
    CapabilityUnavailable,
    Cancelled,
    DeadlineExceeded,
    Conflict,
    Internal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FailureDetail {
    Text(String),
    Number(f64),
    Boolean(bool),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RpcFailure {
    pub code: FailureCode,
    pub message: String,
    pub retryable: bool,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub details: Option<BTreeMap<String, FailureDetail>>,
}

/// Decode a complete JSON body. Errors intentionally contain no submitted content.
pub fn parse<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T, ContractError> {
    if bytes.len() > MAX_ENVELOPE_BYTES {
        return Err(ContractError::invalid("Protocol envelope exceeds 1 MiB."));
    }
    let value = json::parse(bytes).map_err(|_| ContractError::invalid("Invalid JSON envelope."))?;
    serde_json::from_value(value).map_err(|_| ContractError::invalid("Invalid protocol message."))
}

/// The supplied broker-owned registry validator must reject unknown methods and
/// invalid method parameters. The caller's message never supplies this registry.
pub fn parse_request(
    bytes: &[u8],
    validate: impl FnOnce(&str, &Value) -> bool,
) -> Result<RpcRequest, ContractError> {
    let request: RpcRequest = parse(bytes)?;
    if !validate(&request.method, &request.params) {
        return Err(ContractError::invalid(
            "Invalid protocol method or parameters.",
        ));
    }
    Ok(request)
}

/// Read one frame, checking the claimed size BEFORE allocating body storage.
/// EOF between frames is normal; any error requires dropping the connection.
pub fn read_frame(reader: &mut impl Read) -> Result<Option<Vec<u8>>, ContractError> {
    let mut header = [0_u8; 4];
    match reader.read(&mut header[..1]) {
        Ok(0) => return Ok(None),
        Ok(_) => {}
        Err(_) => return Err(ContractError::invalid("Protocol read failed.")),
    }
    reader
        .read_exact(&mut header[1..])
        .map_err(|_| ContractError::invalid("Truncated protocol frame."))?;
    let size = u32::from_be_bytes(header) as usize;
    if size > MAX_ENVELOPE_BYTES {
        return Err(ContractError::invalid("Protocol envelope exceeds 1 MiB."));
    }
    if size == 0 {
        return Err(ContractError::invalid("Invalid JSON envelope."));
    }
    let mut payload = vec![0; size];
    reader
        .read_exact(&mut payload)
        .map_err(|_| ContractError::invalid("Truncated protocol frame."))?;
    // Validate JSON at the frame boundary; callers still choose the message schema.
    parse::<Value>(&payload)?;
    Ok(Some(payload))
}

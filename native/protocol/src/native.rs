use crate::{CapabilityState, CapabilityStatus, ContractError, FailureCode, RpcFailure, parse};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

fn yes<'de, D: Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    if bool::deserialize(d)? {
        Ok(true)
    } else {
        Err(serde::de::Error::custom("expected true"))
    }
}
fn no<'de, D: Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    if !bool::deserialize(d)? {
        Ok(false)
    } else {
        Err(serde::de::Error::custom("expected false"))
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EffectOutcome {
    NotApplied,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "stage",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum NativeProgress {
    Requested {
        #[serde(deserialize_with = "no")]
        terminal: bool,
    },
    Acknowledged {
        #[serde(deserialize_with = "no")]
        terminal: bool,
    },
    Observed {
        #[serde(deserialize_with = "yes")]
        terminal: bool,
        observation: Value,
    },
    Failed {
        #[serde(deserialize_with = "yes")]
        terminal: bool,
        failure: RpcFailure,
        effect_outcome: EffectOutcome,
        #[serde(deserialize_with = "no")]
        auto_replay: bool,
    },
    CompositorUnavailable {
        #[serde(deserialize_with = "yes")]
        terminal: bool,
        capability: CapabilityStatus,
        failure: RpcFailure,
        effect_outcome: EffectOutcome,
        #[serde(deserialize_with = "no")]
        auto_replay: bool,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireNativeOperationEvent {
    #[serde(deserialize_with = "crate::version")]
    protocol_version: u64,
    invocation_id: String,
    operation: String,
    capability_id: String,
    #[serde(deserialize_with = "crate::integer")]
    generation: u64,
    progress: NativeProgress,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", try_from = "WireNativeOperationEvent")]
pub struct NativeOperationEvent {
    pub protocol_version: u64,
    pub invocation_id: String,
    pub operation: String,
    pub capability_id: String,
    pub generation: u64,
    pub progress: NativeProgress,
}
impl TryFrom<WireNativeOperationEvent> for NativeOperationEvent {
    type Error = &'static str;
    fn try_from(w: WireNativeOperationEvent) -> Result<Self, Self::Error> {
        if w.invocation_id.is_empty() || w.operation.is_empty() || w.capability_id.is_empty() {
            return Err("empty native identity");
        }
        if let NativeProgress::CompositorUnavailable {
            capability,
            failure,
            effect_outcome,
            ..
        } = &w.progress
            && (capability.id != w.capability_id
                || capability.generation != w.generation
                || capability.state != CapabilityState::TemporarilyUnavailable
                || capability.reason_code.as_deref() != Some("compositor-failed")
                || capability
                    .remediation_action
                    .as_deref()
                    .is_none_or(|s| s.is_empty())
                || !matches!(failure.code, FailureCode::CapabilityUnavailable)
                || failure.retryable
                || *effect_outcome != EffectOutcome::Unknown)
        {
            return Err("invalid compositor failure");
        }
        Ok(Self {
            protocol_version: w.protocol_version,
            invocation_id: w.invocation_id,
            operation: w.operation,
            capability_id: w.capability_id,
            generation: w.generation,
            progress: w.progress,
        })
    }
}

/// Validate against the broker-owned operation/capability/postcondition registry.
/// Wire assertions do not establish source authentication or a real OS effect.
pub fn parse_native_operation_event(
    bytes: &[u8],
    validate: impl FnOnce(&str, &str, Option<&Value>) -> bool,
) -> Result<NativeOperationEvent, ContractError> {
    let event: NativeOperationEvent = parse(bytes)?;
    let observation = match &event.progress {
        NativeProgress::Observed { observation, .. } => Some(observation),
        _ => None,
    };
    if !validate(&event.operation, &event.capability_id, observation) {
        return Err(ContractError::invalid(
            "Invalid native operation or observation.",
        ));
    }
    Ok(event)
}

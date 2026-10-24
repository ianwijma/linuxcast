//! Selected-root metadata only. Parent-owned framing; no SQLite, content reads,
//! shell invocation or ambient whole-home scan.
mod policy;
mod walk;
mod watch;

use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc,
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    id: String,
    path: String,
    include_hidden: bool,
    exclude_globs: Vec<String>,
    excluded_directories: Vec<String>,
    max_file_bytes: Option<u64>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    visited: u64,
    indexed: u64,
    excluded: u64,
    denied: u64,
    vanished: u64,
    unsupported: u64,
    watch_failures: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    path: String,
    kind: &'static str,
    size: u64,
    modified_ms: i64,
    device: String,
    inode: String,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum Command {
    Configure {
        id: String,
        #[serde(rename = "protocolVersion")]
        protocol_version: u8,
        config: Config,
    },
    Scan {
        id: String,
    },
    Poll {
        id: String,
    },
    Cancel,
    Close,
}
pub(super) fn send(value: &impl Serialize) -> Result<(), &'static str> {
    let bytes = serde_json::to_vec(value).map_err(|_| "protocol-unavailable")?;
    if bytes.len() > linuxcast_protocol::MAX_ENVELOPE_BYTES {
        return Err("frame-too-large");
    }
    let mut out = io::stdout().lock();
    out.write_all(&(bytes.len() as u32).to_be_bytes())
        .and_then(|()| out.write_all(&bytes))
        .and_then(|()| out.flush())
        .map_err(|_| "connection-closed")
}
fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
/// Fixed route called only by the packaged platform executable.
pub fn run_stdio() -> Result<(), &'static str> {
    let cancelled = Arc::new(AtomicBool::new(false));
    let disconnected = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::sync_channel(8);
    let cancel_reader = cancelled.clone();
    let disconnected_reader = disconnected.clone();
    std::thread::spawn(move || {
        let mut input = io::stdin().lock();
        while let Ok(Some(bytes)) = linuxcast_protocol::read_frame(&mut input) {
            let command = linuxcast_protocol::parse::<Command>(&bytes);
            match command {
                Ok(Command::Cancel) => {
                    cancel_reader.store(true, Ordering::SeqCst);
                }
                Ok(Command::Close) => {
                    cancel_reader.store(true, Ordering::SeqCst);
                    break;
                }
                Ok(command) => {
                    if matches!(command, Command::Scan { .. }) {
                        cancel_reader.store(false, Ordering::SeqCst);
                    }
                    if tx.try_send(command).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        disconnected_reader.store(true, Ordering::SeqCst);
        cancel_reader.store(true, Ordering::SeqCst);
    });
    send(
        &serde_json::json!({"kind":"ready","protocolVersion":1,"backend":"linux-openat2-inotify"}),
    )?;
    let mut selected: Option<walk::SelectedRoot> = None;
    while let Ok(command) = rx.recv() {
        if disconnected.load(Ordering::SeqCst) {
            break;
        }
        match command {
            Command::Configure {
                id,
                protocol_version,
                config,
            } => {
                if !uuid(&id) {
                    return Err("invalid-request");
                }
                let result =
                    if protocol_version != 1 || !uuid(&config.id) || !policy::valid(&config) {
                        Err("invalid-request")
                    } else {
                        walk::SelectedRoot::open(config)
                    };
                match result {
                    Ok(root) => {
                        selected = Some(root);
                        send(&serde_json::json!({"kind":"configured","id":id}))?;
                    }
                    Err(reason) => {
                        selected = None;
                        send(&serde_json::json!({"kind":"failed","id":id,"reason":reason}))?;
                    }
                }
            }
            Command::Scan { id } => {
                if !uuid(&id) {
                    return Err("invalid-request");
                }
                if let Some(root) = selected.as_mut() {
                    root.scan(&id, &cancelled, &disconnected)?;
                } else {
                    send(&serde_json::json!({"kind":"failed","id":id,"reason":"not-configured"}))?;
                }
            }
            Command::Poll { id } => {
                if !uuid(&id) {
                    return Err("invalid-request");
                }
                let (dirty, overflow, available) = selected
                    .as_mut()
                    .map(|r| r.poll())
                    .unwrap_or((true, false, false));
                send(
                    &serde_json::json!({"kind":"watch","id":id,"dirty":dirty,"overflow":overflow,"available":available}),
                )?;
            }
            Command::Cancel | Command::Close => break,
        }
    }
    Ok(())
}

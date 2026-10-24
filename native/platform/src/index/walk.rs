use super::{Config, Entry, Progress, policy, send, watch::Watcher};
use std::ffi::CString;
use std::fs::{self, File};
use std::io;
use std::os::{
    fd::{AsRawFd, FromRawFd},
    unix::fs::MetadataExt,
};
use std::sync::atomic::{AtomicBool, Ordering};

#[repr(C)]
struct OpenHow {
    flags: u64,
    mode: u64,
    resolve: u64,
}
fn beneath(parent: i32, path: &str, directory: bool, no_mount: bool) -> io::Result<File> {
    let path = CString::new(path).map_err(|_| io::Error::from_raw_os_error(libc::EINVAL))?;
    let how = OpenHow {
        flags: (libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | if directory {
                libc::O_RDONLY | libc::O_DIRECTORY
            } else {
                libc::O_PATH
            }) as u64,
        mode: 0,
        resolve: 0x04 | 0x08 | if no_mount { 0x01 } else { 0 },
    };
    // SAFETY: Linux open_how ABI from linux/openat2.h; live parent fd,
    // NUL-terminated path and initialized fixed-size argument. No fallback.
    let fd = unsafe {
        libc::syscall(
            libc::SYS_openat2,
            parent,
            path.as_ptr(),
            &how,
            std::mem::size_of::<OpenHow>(),
        )
    };
    if fd < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd as i32) })
    }
}
fn open_root(config: &Config) -> Result<File, &'static str> {
    let slash = File::open("/").map_err(|_| "root-unavailable")?;
    let file = beneath(
        slash.as_raw_fd(),
        if config.path == "/" {
            "."
        } else {
            &config.path[1..]
        },
        true,
        false,
    )
    .map_err(|e| {
        if e.raw_os_error() == Some(libc::ENOSYS) {
            "unsupported"
        } else {
            "root-unavailable"
        }
    })?;
    let mut stat = std::mem::MaybeUninit::<libc::statfs>::uninit();
    // SAFETY: valid fd and writable statfs storage; assume_init only on success.
    if unsafe { libc::fstatfs(file.as_raw_fd(), stat.as_mut_ptr()) } != 0 {
        return Err("root-unavailable");
    }
    let kind = unsafe { stat.assume_init() }.f_type as u64;
    if ![0xef53, 0x58465342, 0x9123683e, 0x01021994, 0x794c7630].contains(&kind) {
        return Err("unsupported");
    }
    Ok(file)
}
fn failure(progress: &mut Progress, error: &io::Error) {
    match error.raw_os_error() {
        Some(libc::EACCES | libc::EPERM) => progress.denied += 1,
        Some(libc::ENOENT | libc::ENOTDIR) => progress.vanished += 1,
        Some(libc::EXDEV | libc::ELOOP) => progress.excluded += 1,
        _ => progress.unsupported += 1,
    }
}
pub(super) struct SelectedRoot {
    config: Config,
    root: File,
    device: u64,
    inode: u64,
    watcher: Watcher,
}
impl SelectedRoot {
    pub fn open(config: Config) -> Result<Self, &'static str> {
        let root = open_root(&config)?;
        let metadata = root.metadata().map_err(|_| "root-unavailable")?;
        Ok(Self {
            config,
            root,
            device: metadata.dev(),
            inode: metadata.ino(),
            watcher: Watcher::new(),
        })
    }
    fn current(&self) -> bool {
        open_root(&self.config)
            .and_then(|f| f.metadata().map_err(|_| "root-unavailable"))
            .is_ok_and(|m| m.dev() == self.device && m.ino() == self.inode)
    }
    pub fn poll(&mut self) -> (bool, bool, bool) {
        let (dirty, overflow, available) = self.watcher.poll();
        (dirty || !self.current(), overflow, available)
    }
    pub fn scan(
        &mut self,
        id: &str,
        cancel: &AtomicBool,
        disconnected: &AtomicBool,
    ) -> Result<(), &'static str> {
        let mut progress = Progress::default();
        if !self.current() {
            return send(
                &serde_json::json!({"kind":"finished","id":id,"outcome":"unavailable","progress":progress}),
            );
        }
        self.watcher = Watcher::new();
        let mut stack = vec![String::new()];
        let mut batch = Vec::new();
        let mut batch_bytes = 0;
        let mut cancelled = false;
        while let Some(relative) = stack.pop() {
            if cancel.load(Ordering::SeqCst) || disconnected.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }
            let directory = match beneath(
                self.root.as_raw_fd(),
                if relative.is_empty() { "." } else { &relative },
                true,
                true,
            ) {
                Ok(f) => f,
                Err(e) => {
                    failure(&mut progress, &e);
                    continue;
                }
            };
            if !self.watcher.add(directory.as_raw_fd()) {
                progress.watch_failures += 1;
            }
            let entries = match fs::read_dir(format!("/proc/self/fd/{}", directory.as_raw_fd())) {
                Ok(v) => v,
                Err(e) => {
                    failure(&mut progress, &e);
                    continue;
                }
            };
            for child in entries {
                if cancel.load(Ordering::SeqCst) || disconnected.load(Ordering::SeqCst) {
                    cancelled = true;
                    break;
                }
                progress.visited += 1;
                let child = match child {
                    Ok(c) => c,
                    Err(e) => {
                        failure(&mut progress, &e);
                        continue;
                    }
                };
                let name = match child.file_name().into_string() {
                    Ok(n) => n,
                    Err(_) => {
                        progress.unsupported += 1;
                        continue;
                    }
                };
                let path = if relative.is_empty() {
                    name
                } else {
                    format!("{relative}/{name}")
                };
                if !policy::relative(&path) {
                    progress.unsupported += 1;
                    continue;
                }
                if policy::excluded(&self.config, &path) {
                    progress.excluded += 1;
                    continue;
                }
                // Resolve each full relative path from the selected root, not a
                // cached pathname or an ancestor that might have moved outside it.
                let file = match beneath(self.root.as_raw_fd(), &path, false, true) {
                    Ok(f) => f,
                    Err(e) => {
                        failure(&mut progress, &e);
                        continue;
                    }
                };
                let metadata = match file.metadata() {
                    Ok(m) => m,
                    Err(e) => {
                        failure(&mut progress, &e);
                        continue;
                    }
                };
                if !metadata.is_file() && !metadata.is_dir() {
                    progress.excluded += 1;
                    continue;
                }
                // This is access eligibility, not a content read. AT_EMPTY_PATH
                // evaluates the exact opened inode without resolving a new path.
                let empty = c"";
                let access = if metadata.is_dir() {
                    libc::R_OK | libc::X_OK
                } else {
                    libc::R_OK
                };
                // SAFETY: live O_PATH fd, empty C string, fixed access flags.
                if unsafe {
                    libc::syscall(
                        libc::SYS_faccessat2,
                        file.as_raw_fd(),
                        empty.as_ptr(),
                        access,
                        libc::AT_EMPTY_PATH | libc::AT_EACCESS,
                    )
                } < 0
                {
                    failure(&mut progress, &io::Error::last_os_error());
                    continue;
                }
                if metadata.is_file()
                    && self
                        .config
                        .max_file_bytes
                        .is_some_and(|max| metadata.len() > max)
                {
                    progress.excluded += 1;
                    continue;
                }
                let modified = metadata
                    .mtime()
                    .saturating_mul(1000)
                    .saturating_add(metadata.mtime_nsec() / 1_000_000);
                if metadata.len() > 9_007_199_254_740_991
                    || modified.unsigned_abs() > 9_007_199_254_740_991
                {
                    progress.unsupported += 1;
                    continue;
                }
                if metadata.is_dir() {
                    stack.push(path.clone());
                }
                batch_bytes += path.len() * 6 + 256; // Worst-case JSON escaping bound.
                batch.push(Entry {
                    path,
                    kind: if metadata.is_dir() {
                        "directory"
                    } else {
                        "file"
                    },
                    size: metadata.len(),
                    modified_ms: modified,
                    device: metadata.dev().to_string(),
                    inode: metadata.ino().to_string(),
                });
                progress.indexed += 1;
                if batch.len() >= 32 || batch_bytes >= 800_000 {
                    send(
                        &serde_json::json!({"kind":"batch","id":id,"entries":batch,"progress":progress}),
                    )?;
                    batch.clear();
                    batch_bytes = 0;
                }
            }
            if cancelled {
                break;
            }
        }
        if !batch.is_empty() && !cancelled {
            send(&serde_json::json!({"kind":"batch","id":id,"entries":batch,"progress":progress}))?;
        }
        let outcome = if disconnected.load(Ordering::SeqCst) || cancelled {
            "cancelled"
        } else if !self.current() {
            "unavailable"
        } else {
            "complete"
        };
        send(&serde_json::json!({"kind":"finished","id":id,"outcome":outcome,"progress":progress}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_mount_is_rejected_before_enumeration() {
        // Approved fixed metadata-only mount check. No host directory is listed.
        let root = File::open("/").unwrap();
        let error = beneath(root.as_raw_fd(), "proc", true, true).unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::EXDEV));
    }
}

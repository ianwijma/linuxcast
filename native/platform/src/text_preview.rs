//! One bounded literal read from the same descriptor that passed root resolution.
//! No content parsing, pathname reopen, cache, diagnostics or external handoff.
use std::ffi::CString;
use std::fs::{File, Metadata};
use std::io::Read;
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
use std::os::unix::fs::MetadataExt;

const MAX: u64 = 65_536;
type PreviewResult<T> = Result<T, &'static str>;

fn relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && !path.chars().any(char::is_control)
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

#[repr(C)]
struct OpenHow {
    flags: u64,
    mode: u64,
    resolve: u64,
}

fn open_beneath(parent: RawFd, path: &str, directory: bool) -> PreviewResult<File> {
    let path = CString::new(path).map_err(|_| "invalid-request")?;
    let how = OpenHow {
        flags: (libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | if directory {
                libc::O_PATH | libc::O_DIRECTORY
            } else {
                libc::O_RDONLY | libc::O_NONBLOCK
            }) as u64,
        mode: 0,
        // RESOLVE_NO_SYMLINKS | RESOLVE_BENEATH; files also RESOLVE_NO_XDEV.
        resolve: 0x04 | 0x08 | if directory { 0 } else { 0x01 },
    };
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
        let error = std::io::Error::last_os_error();
        Err(
            if matches!(error.raw_os_error(), Some(libc::ENOSYS | libc::EINVAL)) {
                "unavailable"
            } else {
                "stale-application"
            },
        )
    } else {
        // This syscall transfers exactly one owned descriptor; File closes it.
        Ok(unsafe { File::from_raw_fd(fd as RawFd) })
    }
}

fn same_snapshot(before: &Metadata, after: &Metadata) -> bool {
    before.dev() == after.dev()
        && before.ino() == after.ino()
        && before.len() == after.len()
        && before.mtime() == after.mtime()
        && before.mtime_nsec() == after.mtime_nsec()
        && before.ctime() == after.ctime()
        && before.ctime_nsec() == after.ctime_nsec()
}

fn read_checked(file: &mut File, before: &Metadata) -> PreviewResult<String> {
    let mut bytes = Vec::with_capacity(before.len() as usize);
    file.take(MAX + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "unavailable")?;
    let after = file.metadata().map_err(|_| "stale-application")?;
    if bytes.len() as u64 != before.len() || !same_snapshot(before, &after) {
        return Err("stale-application");
    }
    if bytes.len() as u64 > MAX
        || bytes
            .iter()
            .any(|b| (*b < 0x20 && !b"\t\n\r".contains(b)) || *b == 0x7f)
    {
        return Err("unavailable");
    }
    String::from_utf8(bytes).map_err(|_| "unavailable")
}

pub(crate) fn preview(
    root_path: &str,
    relative_path: &str,
    size: u64,
    modified_ms: i64,
) -> PreviewResult<String> {
    if root_path.len() > 4096
        || !root_path.starts_with('/')
        || (root_path != "/" && !relative(&root_path[1..]))
        || !relative(relative_path)
        || size > MAX
        || modified_ms.unsigned_abs() > 9_007_199_254_740_991
    {
        return Err("invalid-request");
    }
    let extension = relative_path.rsplit('.').next().unwrap_or_default();
    if !["txt", "text", "md", "csv", "json", "log"]
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        || !relative_path
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .contains('.')
    {
        return Err("unavailable");
    }
    let slash = File::open("/").map_err(|_| "unavailable")?;
    let root = open_beneath(
        slash.as_raw_fd(),
        if root_path == "/" {
            "."
        } else {
            &root_path[1..]
        },
        true,
    )?;
    let mut file = open_beneath(root.as_raw_fd(), relative_path, false)?;
    let before = file.metadata().map_err(|_| "stale-application")?;
    if !before.is_file() || before.mode() & 0o111 != 0 || before.len() > MAX {
        return Err("unavailable");
    }
    let modified = before
        .mtime()
        .saturating_mul(1000)
        .saturating_add(before.mtime_nsec() / 1_000_000);
    if before.len() != size || modified != modified_ms {
        return Err("stale-application");
    }
    read_checked(&mut file, &before)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::io::{Seek, Write};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn changed_size_or_same_size_with_restored_mtime_rejects_the_snapshot() {
        let path = std::env::temp_dir().join(format!(
            "linuxcast-preview-snapshot-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, b"public initial").unwrap();
        let mut file = File::open(&path).unwrap();
        let before = file.metadata().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        fs::write(&path, b"public changed").unwrap();
        file.set_modified(before.modified().unwrap()).unwrap();
        assert_eq!(read_checked(&mut file, &before), Err("stale-application"));
        let mut file = File::open(&path).unwrap();
        let before = file.metadata().unwrap();
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&vec![b'x'; MAX as usize + 1])
            .unwrap();
        assert_eq!(read_checked(&mut file, &before), Err("stale-application"));
        assert_eq!(file.stream_position().unwrap(), MAX + 1);
        fs::remove_file(path).unwrap();
    }
}

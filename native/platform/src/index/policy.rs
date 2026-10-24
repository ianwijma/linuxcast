use super::Config;

pub(super) fn relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && !path.contains('\0')
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|c| !c.is_empty() && c != "." && c != "..")
}
pub(super) fn valid(config: &Config) -> bool {
    let path = &config.path;
    path.starts_with('/')
        && (path == "/" || relative(&path[1..]))
        && path.len() <= 4096
        && config
            .max_file_bytes
            .is_none_or(|n| n <= 9_007_199_254_740_991)
        && config.exclude_globs.len() <= 64
        && config.exclude_globs.iter().all(|p| {
            !p.is_empty()
                && p.len() <= 256
                && !p.starts_with('/')
                && !p.contains(['[', ']', '\\', '!', '\0'])
        })
        && config.excluded_directories.len() <= 128
        && config.excluded_directories.iter().all(|p| relative(p))
}
/// Bounded dynamic programming, never exponential regex/backtracking.
pub(super) fn matches(pattern: &str, path: &str) -> bool {
    #[derive(Clone, Copy)]
    enum Token {
        Literal(char),
        Any,
        Star,
        Glob,
        Directories,
    }
    let chars: Vec<char> = pattern.chars().collect();
    let mut p = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '*' && chars.get(i + 1) == Some(&'*') {
            if chars.get(i + 2) == Some(&'/') {
                p.push(Token::Directories);
                i += 3;
            } else {
                p.push(Token::Glob);
                i += 2;
            }
        } else {
            p.push(match chars[i] {
                '*' => Token::Star,
                '?' => Token::Any,
                c => Token::Literal(c),
            });
            i += 1;
        }
    }
    let s: Vec<char> = path.chars().collect();
    let mut next = vec![false; s.len() + 1];
    next[s.len()] = true;
    for i in (0..p.len()).rev() {
        let mut current = vec![false; s.len() + 1];
        if matches!(p[i], Token::Star | Token::Glob) {
            let cross = matches!(p[i], Token::Glob);
            current[s.len()] = next[s.len()];
            for j in (0..s.len()).rev() {
                current[j] = next[j] || ((cross || s[j] != '/') && current[j + 1]);
            }
        } else if matches!(p[i], Token::Directories) {
            current[s.len()] = next[s.len()];
            let mut suffix = false;
            for j in (0..s.len()).rev() {
                suffix |= s[j] == '/' && next[j + 1];
                current[j] = next[j] || suffix;
            }
        } else {
            for j in 0..s.len() {
                current[j] = match p[i] {
                    Token::Literal(c) => c == s[j],
                    Token::Any => s[j] != '/',
                    _ => false,
                } && next[j + 1];
            }
        }
        next = current;
    }
    next[0]
}
pub(super) fn excluded(config: &Config, path: &str) -> bool {
    (!config.include_hidden && path.split('/').any(|p| p.starts_with('.')))
        || config
            .excluded_directories
            .iter()
            .any(|p| path == p || path.strip_prefix(p).is_some_and(|s| s.starts_with('/')))
        || config.exclude_globs.iter().any(|p| matches(p, path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_globs() {
        for p in ["*.tmp", "**/*.tmp"] {
            assert!(matches(p, "file.tmp"));
        }
        assert!(!matches("*.tmp", "dir/file.tmp"));
        assert!(matches("**/*.tmp", "one/two/file.tmp"));
        assert!(matches("doc?.txt", "doc1.txt"));
        assert!(!matches("a/*/b", "a/one/two/b"));
        assert!(matches("a/**/b", "a/one/two/b"));
    }
}

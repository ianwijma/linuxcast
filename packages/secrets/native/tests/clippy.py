#!/usr/bin/python3
"""Lint the unregistered module offline without editing a workspace manifest."""
import json
from pathlib import Path
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix="linuxcast-session-lint-") as directory:
    root = Path(directory)
    source = Path(__file__).resolve().parents[1] / "session.rs"
    (root / "Cargo.toml").write_text(
        '[package]\nname = "linuxcast-session-standalone-lint"\n'
        'version = "0.0.0"\nedition = "2024"\n[lib]\npath = '
        + json.dumps(str(source)) + "\n"
    )
    result = subprocess.run([
        "cargo", "clippy", "--offline", "--manifest-path", str(root / "Cargo.toml"),
        "--all-targets", "--", "-D", "warnings",
    ], check=False)
    raise SystemExit(result.returncode)

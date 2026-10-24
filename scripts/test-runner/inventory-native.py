#!/usr/bin/env python3
"""Consume cargo metadata on stdin; retain only public dependency metadata."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
data = json.load(sys.stdin)
packages = sorted(data["packages"], key=lambda package: (package["name"], package["version"]))
result = {
    "scope": "Rust workspace development inventory, not the final shipped-content SBOM",
    "cargoLockSha256": hashlib.sha256((root / "Cargo.lock").read_bytes()).hexdigest(),
    "dependencies": [
        {key: package.get(key) for key in ("name", "version", "license", "repository", "source")}
        for package in packages
    ],
}
(root / "scripts/test-runner/rust-dependency-inventory.json").write_text(json.dumps(result, indent=2) + "\n")
print(f"Inventoried {len(packages)} Rust workspace and transitive packages")

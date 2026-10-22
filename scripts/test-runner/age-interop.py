#!/usr/bin/env python3
"""Exercise Go age and Rust age with public synthetic content, no secret argv/env."""
import argparse
import errno
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
# Public fixture value, deliberately unrelated to any real user credential.
PASSPHRASE = b"synthetic bootstrap fixture only\n"
PAYLOAD = b"public build fixture"
FIXTURE = ROOT / "scripts/test-runner/native/fixtures/reference-age.age"


def run_reference(args, prompts):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("age", ["age", *map(str, args)])
    remaining = list(prompts)
    observed = b""
    deadline = time.monotonic() + 30
    completed = False
    try:
        while time.monotonic() < deadline:
            if select.select([fd], [], [], 0.05)[0]:
                try:
                    part = os.read(fd, 4096)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    part = b""
                observed = (observed + part)[-8192:]
                if remaining and remaining[0] in observed:
                    os.write(fd, PASSPHRASE)
                    remaining.pop(0)
                    observed = b""
            result, status = os.waitpid(pid, os.WNOHANG)
            if result:
                completed = True
                if os.waitstatus_to_exitcode(status) != 0 or remaining:
                    # Do not publish raw terminal output, even for synthetic data.
                    raise RuntimeError("Reference age failed or did not exercise its expected prompts")
                return
        raise RuntimeError("Reference age prompt timed out")
    finally:
        os.close(fd)
        if not completed:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate-reference", action="store_true")
    args = parser.parse_args()
    version = subprocess.check_output(["age", "--version"], text=True).strip()
    with tempfile.TemporaryDirectory(prefix="linuxcast-age-interop-") as directory:
        directory = Path(directory)
        plain = directory / "public.txt"
        plain.write_bytes(PAYLOAD)
        if args.generate_reference:
            output = directory / "reference.age"
            run_reference(["--passphrase", "--output", output, plain], [b"Enter passphrase", b"Confirm passphrase"])
            FIXTURE.write_bytes(output.read_bytes())
            print(f"Generated public passphrase fixture with reference age {version}")
        else:
            encrypted = directory / "rust.age"
            subprocess.run(["cargo", "run", "--quiet", "--locked", "--example", "bootstrap-age-interop", "--", str(encrypted)], cwd=ROOT, check=True)
            output = directory / "decrypted.txt"
            run_reference(["--decrypt", "--output", output, encrypted], [b"Enter passphrase"])
            if output.read_bytes() != PAYLOAD:
                raise RuntimeError("Cross-implementation plaintext mismatch")
            print(f"Rust age 0.12.1 -> reference age {version}: pass; synthetic payload matches")


if __name__ == "__main__":
    main()

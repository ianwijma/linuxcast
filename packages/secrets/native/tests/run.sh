#!/bin/sh
# Offline, standalone validation. Never starts a host bus or uses a desktop.
set -eu
test_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
test_build=$(mktemp -d /tmp/linuxcast-session-build.XXXXXX)
trap 'rm -rf -- "$test_build"' EXIT HUP INT TERM
chmod 755 "$test_build"
test_image=sha256:7a9b0ce66e89479ffa08120e240c52f7dd150f4355b0b5073c24f5e66494d785
docker image inspect "$test_image" >/dev/null
rustc --version
python3 "$test_root/tests/clippy.py"
rustfmt --edition 2024 --check "$test_root/session.rs" "$test_root/tests/harness.rs" "$test_root/tests/policy.rs"
rustc --edition=2024 -D warnings --test "$test_root/session.rs" -o "$test_build/policy"
"$test_build/policy"
rustc --edition=2024 -D warnings "$test_root/tests/harness.rs" -o "$test_build/observer"
for test_user in 0:0 65534:65534; do
    # Default isolated /dev contains only Docker's pseudo devices; no host
    # devices, sockets, lab state, home, namespace or privileged mode is mounted.
    docker run --rm --user "$test_user" --network none --cap-drop ALL \
        --security-opt no-new-privileges --read-only \
        --tmpfs /tmp:rw,nosuid,nodev --pids-limit 64 --memory 256m \
        --mount "type=bind,src=$test_root,dst=/fixture,readonly" \
        --mount "type=bind,src=$test_build/observer,dst=/observer,readonly" \
        "$test_image" env -i PATH=/usr/bin:/bin LANG=C.UTF-8 \
        /bin/sh -c '
            if [ "$(id -u)" = 0 ]; then
                /usr/bin/python3 /fixture/tests/synthetic.py /observer
            else
                /usr/bin/python3 /fixture/tests/synthetic.py /observer --denied-only
            fi
            result=$?
            exit "$result"
        '
done

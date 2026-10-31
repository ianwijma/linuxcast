"""Offline synthetic boundaries only. No GI, native bus, display, Orca or input."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest

from native_at import envelope, xvfb_arguments
from observations import Observer, Rejected, checkpoint


class Node:
    def __init__(self, name="private canary", kind="other", pid=101, children=(), **states):
        self.label, self.role, self.owner = name, kind, pid
        self.nodes, self.states = children, states
        self.reads = 0

    def pid(self):
        return self.owner

    def name(self):
        self.reads += 1
        return self.label

    def kind(self):
        return self.role

    def children(self):
        self.reads += 1
        return self.nodes

    def state(self, name):
        return self.states.get(name, False)


class ObservationTests(unittest.TestCase):
    def setUp(self):
        self.observer = Observer(101, 102, 103)

    def snapshot(self, *nodes):
        return self.observer.snapshot([Node(children=nodes)])

    def control(self, name="Search commands", kind="entry", **states):
        return Node(name, kind, focused=True, visible=True, showing=True, **states)

    def test_fresh_native_focus_and_role_are_both_required(self):
        node = self.control()
        before = self.snapshot(node)["sequence"]
        self.assertFalse(checkpoint(self.snapshot(node), "search", "entry", before))
        self.observer.event(node, "focus")
        self.assertTrue(checkpoint(self.snapshot(node), "search", "entry", before))
        self.assertFalse(checkpoint(self.snapshot(node), "search", "listbox", before))
        self.assertFalse(checkpoint(self.snapshot(node), "search", "entry", self.observer.sequence))

    def test_loss_hidden_and_duplicate_controls_cannot_pass(self):
        node = self.control()
        self.observer.event(node, "focus", False)
        self.assertFalse(checkpoint(self.snapshot(node), "search", "entry", 0))
        self.observer.event(node, "focus")
        self.assertFalse(checkpoint(self.snapshot(node, node), "search", "entry", 0))
        for state in ("focused", "visible", "showing"):
            with self.subTest(state=state):
                node.states[state] = False
                self.assertFalse(checkpoint(self.snapshot(node), "search", "entry", 0))
                node.states[state] = True

    def test_result_selection_does_not_require_option_focus(self):
        result = Node("Public AT result Installed application", "option", selected=True, visible=True, showing=True)
        listing = self.control(kind="listbox")
        self.observer.event(result, "selection")
        self.assertTrue(checkpoint(self.snapshot(result, listing), "public-result", "option", 0, "selection"))
        listing.states["focused"] = False
        self.assertFalse(checkpoint(self.snapshot(result, listing), "public-result", "option", 0, "selection"))

    def test_active_descendant_needs_selected_visible_native_item(self):
        node = Node("Public AT result Installed application", "option", selected=True, visible=True, showing=True)
        self.observer.event(node, "active-descendant")
        self.assertTrue(checkpoint(self.snapshot(node, self.control(kind="listbox")), "public-result", "option", 0, "active-descendant"))
        node.states["selected"] = False
        self.assertFalse(checkpoint(self.snapshot(node, self.control(kind="listbox")), "public-result", "option", 0, "active-descendant"))

    def test_alternate_and_final_require_exact_name_fresh_event_and_current_selection(self):
        for label, identifier in (("Public AT result alternate Installed application", "public-alternate"),
                                  ("Public AT filler 119 Installed application", "public-final")):
            with self.subTest(identifier=identifier):
                observer = Observer(101, 102, 103)
                row = Node(label, "option", selected=True, visible=True, showing=True)
                listing = self.control(kind="listbox")
                observer.event(row, "active-descendant")
                value = observer.snapshot([Node(children=[row, listing])])
                self.assertTrue(checkpoint(value, identifier, "option", 0, "active-descendant"))
                self.assertFalse(checkpoint(value, identifier, "option", value["sequence"], "active-descendant"))
                for state in ("selected", "visible", "showing"):
                    row.states[state] = False
                    self.assertFalse(checkpoint(observer.snapshot([Node(children=[row, listing])]), identifier, "option", 0, "active-descendant"))
                    row.states[state] = True
                self.assertFalse(checkpoint(value, identifier, "button", 0, "active-descendant"))
                suffix = Node(label + " private canary", "option", selected=True, visible=True, showing=True)
                observer.event(suffix, "active-descendant")
                self.assertNotIn("canary", json.dumps(observer.snapshot([Node(children=[suffix, listing])])) )

    def test_foreign_application_is_rejected_before_any_content_read(self):
        target, foreign = Node(children=[self.control()]), Node(pid=999)
        with self.assertRaisesRegex(Rejected, "foreign-application"):
            self.observer.snapshot([target, foreign])
        self.assertEqual((target.reads, foreign.reads), (0, 0))

    def test_foreign_event_never_reads_name(self):
        node = Node("Search commands", "entry", pid=999)
        self.observer.event(node, "focus")
        self.assertEqual(node.reads, 0)
        self.assertEqual(self.observer.events, [])

    def test_foreign_child_and_absent_or_duplicate_target_fail(self):
        with self.assertRaisesRegex(Rejected, "foreign-node"):
            self.snapshot(Node(pid=999))
        for apps in ([], [Node(), Node()]):
            with self.subTest(count=len(apps)), self.assertRaisesRegex(Rejected, "target-unavailable"):
                self.observer.snapshot(apps)

    def test_reader_and_observer_are_not_traversed(self):
        reader, observer = Node(pid=103), Node(pid=102)
        self.observer.snapshot([Node(), reader, observer])
        self.assertEqual((reader.reads, observer.reads), (0, 0))

    def test_private_unknown_and_suffix_names_never_escape(self):
        for label in ("private canary", "Search commands private canary", "Public AT result Installed application private canary"):
            node = self.control(label)
            self.observer.event(node, "focus")
            encoded = json.dumps(self.snapshot(node))
            self.assertNotIn("canary", encoded)
            self.assertEqual(self.observer.events, [])
        public = json.dumps(self.snapshot(self.control()))
        self.assertNotIn("101", public)
        self.assertNotIn("Search commands", public)

    def test_tree_and_history_are_bounded(self):
        node = self.control()
        for _ in range(100):
            self.observer.event(node, "focus")
        self.assertEqual(len(self.observer.events), 64)
        self.assertEqual(self.observer.sequence, 100)
        nested = Node()
        for _ in range(32):
            nested = Node(children=[nested])
        with self.assertRaisesRegex(Rejected, "tree-limit"):
            self.snapshot(nested)
        with self.assertRaisesRegex(Rejected, "control-limit"):
            self.snapshot(*[self.control() for _ in range(129)])

    def test_wrong_native_role_and_malformed_state_do_not_pass(self):
        node = self.control(kind="other")
        self.observer.event(node, "focus")
        self.assertEqual(self.snapshot(node)["controls"], [])
        node = self.control()
        node.states["focused"] = "private canary"
        self.observer.event(node, "focus")
        self.assertFalse(checkpoint(self.snapshot(node), "search", "entry", 0))


class EnvelopeTests(unittest.TestCase):
    def test_xvfb_requires_own_display_authority_and_no_tcp(self):
        auth = "/tmp/linuxcast-f102-at-abcdefgh/runtime/Xauthority"
        args = ["/usr/bin/Xvfb", ":123", "-auth", auth, "-nolisten", "tcp"]
        xvfb_arguments(args, ":123", auth)
        cases = [args + ["-ac"], args + ["-listen", "tcp"], args[:4],
                 ["/usr/bin/Xorg", *args[1:]], args + ["-auth", auth]]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(Rejected):
                xvfb_arguments(case, ":123", auth)
        with self.assertRaises(Rejected):
            xvfb_arguments(args, ":1", auth)

    def test_host_or_missing_envelope_fails_before_native_import(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("native_at.py")), "--check-envelope"],
                                env={"PATH": "/usr/bin:/bin", "DISPLAY": ":1"}, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(json.loads(result.stdout), {"status": "unavailable", "reason": "private-root-required", "nativeRun": False})
        self.assertEqual(result.stderr, "")

    def test_private_envelope_paths_and_socket_checks_without_display(self):
        # Actual owned temporary sockets, no D-Bus daemon or native connection.
        with tempfile.TemporaryDirectory(prefix="linuxcast-f102-at-", dir="/tmp") as value:
            root = Path(value)
            # Use a hex suffix so the actual production path guard stands.
            renamed = root.with_name("linuxcast-f102-at-" + os.urandom(8).hex())
            root.rename(renamed)
            try:
                env = {"LINUXCAST_F102_AT_ROOT": str(renamed), "DISPLAY": ":123", "XDG_SESSION_TYPE": "x11", "GSETTINGS_BACKEND": "memory"}
                for key, name in {"HOME": "home", "XDG_RUNTIME_DIR": "runtime", "XDG_CONFIG_HOME": "config", "XDG_CACHE_HOME": "cache", "XDG_DATA_HOME": "data"}.items():
                    (renamed / name).mkdir(mode=0o700)
                    env[key] = str(renamed / name)
                authority = renamed / "runtime/Xauthority"
                authority.touch(mode=0o600)
                env["XAUTHORITY"] = str(authority)
                sockets = []
                try:
                    for key, name in {"DBUS_SESSION_BUS_ADDRESS": "session-bus", "AT_SPI_BUS_ADDRESS": "at-bus"}.items():
                        path = renamed / "runtime" / name
                        sock = socket.socket(socket.AF_UNIX)
                        sock.bind(str(path))
                        sockets.append(sock)
                        env[key] = "unix:path=" + str(path)
                    # Deliberately stop before /proc: no owned Xvfb exists.
                    with self.assertRaisesRegex(Rejected, "owned-xvfb-required"):
                        envelope(env)
                    for key, bad, reason in (("DISPLAY", ":1", "private-display-required"),
                                             ("HOME", "/home/private-canary", "private-profile-required"),
                                             ("DBUS_SESSION_BUS_ADDRESS", "unix:path=/run/user/1000/bus", "private-bus-required"),
                                             ("AT_SPI_BUS_ADDRESS", "unix:abstract=canary", "private-bus-required"),
                                             ("GSETTINGS_BACKEND", "dconf", "private-settings-required")):
                        with self.subTest(key=key), self.assertRaisesRegex(Rejected, reason):
                            envelope({**env, key: bad})
                    authority.chmod(0o644)
                    with self.assertRaisesRegex(Rejected, "private-authority-required"):
                        envelope(env)
                finally:
                    for sock in sockets:
                        sock.close()
            finally:
                renamed.rename(root)


if __name__ == "__main__":
    unittest.main()

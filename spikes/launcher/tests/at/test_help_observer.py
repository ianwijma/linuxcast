"""No GI/AT bus calls: exercise the actual observer definitions with fixed fake nodes."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).with_name("native-at.py")


class Node:
    def __init__(self, name="", role=0, pid=101, children=()):
        self.name, self.role, self.pid, self.children = name, role, pid, children

    def getApplication(self):
        return self

    def get_process_id(self):
        return self.pid

    def getRole(self):
        return self.role

    def getRoleName(self):
        return {1: "entry", 2: "push button", 3: "toggle button", 4: "heading", 5: "landmark"}.get(self.role, "other")

    def getState(self):
        return SimpleNamespace(contains=lambda state: state == 9)

    def __iter__(self):
        return iter(self.children)


def observer(applications):
    tree = ast.parse(SOURCE.read_text())
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {"owned", "focused", "inspect"}
                or isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "expected" for target in node.targets)]
    output = []
    scope = {"target_pid": 101, "allowed_pids": {101, 202}, "events": [], "event_sequence": 0, "output": output.append,
             "pyatspi": SimpleNamespace(ROLE_ENTRY=1, ROLE_PUSH_BUTTON=2, ROLE_TOGGLE_BUTTON=3, ROLE_HEADING=4,
                                        ROLE_LANDMARK=5, STATE_FOCUSED=9,
                                        Registry=SimpleNamespace(getDesktop=lambda index: applications))}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), "exec"), scope)
    return scope, output


class HelpObserverTests(unittest.TestCase):
    def test_exact_help_labels_have_native_button_heading_landmark_kinds(self):
        nodes = [Node("View activation help", 2), Node("Launcher capabilities", 4), Node("Launcher capability details", 5)]
        scope, output = observer([Node(children=nodes)])
        scope["inspect"]()
        self.assertEqual(output[-1]["controls"], [
            {"label": node.name, "role": node.getRoleName(), "kind": kind, "focused": True}
            for node, kind in zip(nodes, ["button", "heading", "landmark"])])

    def test_non_allowlisted_content_is_never_exported(self):
        scope, output = observer([Node(children=[Node("PRIVATE_SEED_DO_NOT_EXPORT", 4)])])
        scope["inspect"]()
        self.assertEqual(output[-1]["controls"], [])
        self.assertNotIn("PRIVATE_SEED", repr(output))

    def test_foreign_application_denies_before_tree_traversal(self):
        class Foreign(Node):
            def __iter__(self):
                raise AssertionError("foreign content must not be traversed")
        scope, output = observer([Foreign(pid=303)])
        scope["inspect"]()
        self.assertEqual(output, [{"status": "isolation-failed", "applications": 1}])

    def test_only_owned_allowlisted_fresh_focus_events_advance(self):
        scope, _ = observer([])
        scope["focused"](SimpleNamespace(source=Node("Launcher capabilities", 4), detail1=True))
        scope["focused"](SimpleNamespace(source=Node("PRIVATE_SEED", 4), detail1=True))
        scope["focused"](SimpleNamespace(source=Node("Launcher capabilities", 4, pid=303), detail1=True))
        scope["focused"](SimpleNamespace(source=Node("Launcher capabilities", 4), detail1=False))
        self.assertEqual(scope["event_sequence"], 1)
        self.assertEqual(scope["events"], ["Launcher capabilities"])


if __name__ == "__main__":
    unittest.main()

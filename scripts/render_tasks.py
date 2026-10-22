#!/usr/bin/env python3
"""Render task cards and dependency diagram from the authoritative task registry."""
import json
import sys
from pathlib import Path
from acceptance import render_acceptance, validate_registry

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/implementation/tasks.json"

def link(path):
    return f"[{path}](../../../{path})"

def render_files(data):
    """Pure rendering: verification state is read verbatim, never inferred or reset."""
    tasks = data["tasks"]
    files = {}
    for task in tasks:
        lines = [f"# {task['id']} — {task['title']}", "",
                 f"Status: **{task['status']}**. Lane: `{task['lane']}`. Target implementer: GPT 6.1 Sol, high reasoning effort.", "",
                 "This card is generated from [tasks.json](../tasks.json). Edit the registry and rerun `python3 scripts/render_tasks.py`; do not independently edit this card.", "",
                 "## Goal and scope", "", task["title"] + ". Implement only the behaviour below and its referenced contracts. This is application work planned for a later PR; the documentation PR does not implement it.", "",
                 "Feature IDs: " + ", ".join(f"`{x}`" for x in task["featureIds"]) + ".", "",
                 "Dependencies: " + (", ".join(f"[{x}]({x}.md)" for x in task["dependsOn"]) or "None; this is ready to start after the planning PR is integrated.") + ".", "",
                 "## Ownership and references", ""]
        lines += [f"- Own `{x}`." for x in task["ownedPaths"]]
        lines += ["", "Shared contracts, dependency manifests, lockfiles, migration numbering and task status are coordinator-owned. If a card explicitly owns one of these, the coordinator performs that card; other lanes request its change rather than editing concurrently.", ""]
        lines += [f"- Normative: {link(x)}." for x in task["specRefs"]]
        lines += [f"- Design: {link(x)}." for x in task["designRefs"]]
        lines += ["", "## Inputs and outputs", ""]
        lines += [f"- Input: {x}." for x in task["inputs"]]
        lines += [f"- Output: {x}." for x in task["outputs"]]
        lines += ["", "## Implementation steps", ""]
        lines += [f"{i}. {x}" for i,x in enumerate(task["steps"], 1)]
        lines += [f"{len(task['steps'])+1}. Add deterministic fixtures for the documented success, error, permission and cancellation boundaries relevant to this task. Keep mocks distinct from real desktop/provider evidence.",
                  f"{len(task['steps'])+2}. Integrate only after dependencies are accepted. Record limitations and request coordinator-owned interface changes explicitly.", "", "## Acceptance", ""]
        lines += render_acceptance(task["acceptance"])
        lines += ["", "## Validation", "",
                  "The following application checks are introduced by foundation tasks; they do not exist in the documentation-only baseline. Run the relevant command after implementation and record its real outcome. Desktop checks require a supported session, not a silent skip.", "", "```sh"]
        lines += task["validation"] + ["```", "", "## Completion evidence", "",
                  "Coordinator records the implementation PR/commit, check outcomes, desktop/backend versions where relevant, visual evidence for UI changes, and any outstanding limitation in `tasks.json`. Do not mark done merely because the document or a mock exists.", ""]
        lines += [f"- {record}" for record in task["evidence"]] or ["No completion evidence recorded."]
        lines += ["", "## Outstanding limitations", ""]
        lines += [f"- {limitation}" for limitation in task["limitations"]] or ["No limitations recorded; pending criteria still require verification."]
        lines += [""]
        files[f"docs/implementation/tasks/{task['id']}.md"] = "\n".join(lines)
    graph = ["# Task dependency graph", "", "Generated from [tasks.json](tasks.json). An edge means the destination depends on the source. Use [the roadmap](ROADMAP.md) for readable lane guidance.", "", "```mermaid", "flowchart TD"]
    for task in tasks:
        node=task["id"].replace("-","_")
        graph.append(f'  {node}["{task["id"]}: {task["title"]}"]')
        for dep in task["dependsOn"]:
            graph.append(f'  {dep.replace("-","_")} --> {node}')
    graph += ["```", ""]
    files["docs/implementation/dependencies.md"] = "\n".join(graph)
    return files


def main():
    data = json.loads(REGISTRY.read_text())
    errors = validate_registry(data)
    if errors:
        print("Cannot render unsupported acceptance claims:")
        print("\n".join(errors))
        return 1
    for name, content in render_files(data).items():
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    print(f"Rendered {len(data['tasks'])} task cards and dependency graph")
    return 0

if __name__ == "__main__":
    sys.exit(main())

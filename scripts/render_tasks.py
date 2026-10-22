#!/usr/bin/env python3
"""Render task cards and dependency diagram from the authoritative task registry."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/implementation/tasks.json"

def link(path):
    return f"[{path}](../../../{path})"

def main():
    tasks = json.loads(REGISTRY.read_text())["tasks"]
    out = ROOT / "docs/implementation/tasks"
    out.mkdir(parents=True, exist_ok=True)
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
        lines += [f"- [ ] {x}" for x in task["acceptance"]]
        lines += ["- [ ] Relevant design states and keyboard/accessibility paths are covered for user-facing changes.",
                  "- [ ] No secrets/private content enter fixtures, diagnostics or screenshots.", "", "## Validation", "",
                  "The following application checks are introduced by foundation tasks; they do not exist in the documentation-only baseline. Run the relevant command after implementation and record its real outcome. Desktop checks require a supported session, not a silent skip.", "", "```sh"]
        lines += task["validation"] + ["```", "", "## Completion evidence", "",
                  "Coordinator records the implementation PR/commit, check outcomes, desktop/backend versions where relevant, visual evidence for UI changes, and any outstanding limitation in `tasks.json`. Do not mark done merely because the document or a mock exists.", ""]
        (out / f"{task['id']}.md").write_text("\n".join(lines))
    graph = ["# Task dependency graph", "", "Generated from [tasks.json](tasks.json). An edge means the destination depends on the source. Use [the roadmap](ROADMAP.md) for readable lane guidance.", "", "```mermaid", "flowchart TD"]
    for task in tasks:
        node=task["id"].replace("-","_")
        graph.append(f'  {node}["{task["id"]}: {task["title"]}"]')
        for dep in task["dependsOn"]:
            graph.append(f'  {dep.replace("-","_")} --> {node}')
    graph += ["```", ""]
    (ROOT / "docs/implementation/dependencies.md").write_text("\n".join(graph))
    print(f"Rendered {len(tasks)} task cards and dependency graph")

if __name__ == "__main__":
    main()

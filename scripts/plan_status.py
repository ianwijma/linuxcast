#!/usr/bin/env python3
"""Read task status; never change it automatically."""
import json
import sys
from collections import Counter
from pathlib import Path
from acceptance import validate_registry

root = Path(__file__).resolve().parents[1]
registry = json.loads((root / "docs/implementation/tasks.json").read_text())
errors = validate_registry(registry)
if errors:
    print("Cannot report readiness from invalid acceptance claims:")
    print("\n".join(errors))
    sys.exit(1)
tasks = registry["tasks"]
by_id = {task["id"]: task for task in tasks}
print("Status:", ", ".join(f"{state}={count}" for state,count in sorted(Counter(t["status"] for t in tasks).items())))
print("Acceptance:", ", ".join(f"{state}={count}" for state, count in sorted(Counter(
    criterion["status"] for task in tasks for criterion in task["acceptance"]).items())))
print("Ready tasks (all prerequisites done):")
for task in tasks:
    if task["status"] == "planned" and all(by_id[d]["status"] == "done" for d in task["dependsOn"]):
        print(f"  {task['id']}: {task['title']}")
print("Application features are planned until real acceptance evidence is recorded.")

"""Criterion evidence rules shared by the renderer, validator and status report.

This validates recorded claims, not the underlying application behaviour. Evidence
still needs human/independent review against the normative task contract.
"""
import re

STATUSES = {"pending", "passed", "failed", "blocked", "not-applicable"}


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def validate_registry(data):
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    if not isinstance(data, dict):
        return ["registry: expected an object"]
    require(data.get("schemaVersion") == 2, "registry: expected schemaVersion 2")
    shared = data.get("sharedAcceptance")
    if not isinstance(shared, list) or not shared:
        return errors + ["registry: missing shared acceptance definitions"]
    templates = {}
    for item in shared:
        if not isinstance(item, dict):
            errors.append("shared acceptance: expected an object")
            continue
        key = item.get("id")
        if not isinstance(key, str) or not re.fullmatch(r"[A-Z][A-Z0-9]*", key):
            errors.append("shared acceptance: invalid ID")
            continue
        require(key not in templates, f"shared acceptance: duplicate {key}")
        require(nonempty(item.get("text")), f"shared acceptance {key}: missing text")
        require(item.get("conditional") is None or nonempty(item.get("conditional")),
                f"shared acceptance {key}: invalid condition")
        templates[key] = item
    require(set(templates) == {"UI", "PRIVACY"}, "registry: required shared criteria UI and PRIVACY")
    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        return errors + ["registry: expected nonempty tasks list"]
    known_ids = set()
    by_id = {}
    for task in tasks:
        if not isinstance(task, dict):
            errors.append("task: expected an object")
            continue
        ident = task.get("id")
        if not isinstance(ident, str) or not re.fullmatch(r"[A-Z][0-9]-[0-9]{2}", ident):
            errors.append("task: invalid ID")
            continue
        require(ident not in by_id, f"task {ident}: duplicate ID")
        by_id[ident] = task
        criteria = task.get("acceptance")
        if not isinstance(criteria, list) or not criteria:
            errors.append(f"task {ident}: missing acceptance records")
            continue
        shared_seen = set()
        specific_count = 0
        for criterion in criteria:
            if not isinstance(criterion, dict):
                errors.append(f"task {ident}: acceptance must contain records")
                continue
            cid = criterion.get("id")
            if not isinstance(cid, str) or not re.fullmatch(re.escape(ident) + r"-(?:AC[0-9]{2,}|UI|PRIVACY)", cid):
                errors.append(f"task {ident}: invalid criterion ID")
                continue
            require(cid not in known_ids, f"criterion {cid}: duplicate ID")
            known_ids.add(cid)
            label = f"criterion {cid}"
            require(nonempty(criterion.get("text")), f"{label}: missing requirement text")
            state = criterion.get("status")
            if not isinstance(state, str) or state not in STATUSES:
                errors.append(f"{label}: invalid verification status")
                continue
            condition = criterion.get("conditional")
            require("conditional" in criterion and (condition is None or nonempty(condition)),
                    f"{label}: invalid/missing condition")
            justification = criterion.get("justification")
            require(isinstance(justification, str), f"{label}: missing justification field")
            if state in {"not-applicable", "failed", "blocked"}:
                require(nonempty(justification), f"{label}: {state} requires justification")
            if state == "not-applicable":
                require(nonempty(condition), f"{label}: unconditional requirement cannot be not-applicable")
            evidence = criterion.get("evidence")
            require(isinstance(evidence, list), f"{label}: evidence must be a list")
            if state == "passed":
                require(isinstance(evidence, list) and bool(evidence), f"{label}: passed without evidence")
            for record in evidence if isinstance(evidence, list) else []:
                require(isinstance(record, dict) and all(nonempty(record.get(k)) for k in
                        ("command", "outcome", "platform", "reference")),
                        f"{label}: evidence needs command, outcome, platform and reference")
            suffix = cid.removeprefix(ident + "-")
            if suffix in templates:
                shared_seen.add(suffix)
                for field in ("text", "conditional"):
                    require(criterion.get(field) == templates[suffix].get(field),
                            f"{label}: differs from shared {field}")
            else:
                specific_count += 1
            if task.get("status") == "done":
                require(state in {"passed", "not-applicable"}, f"task {ident}: outstanding acceptance {cid}")
        require(specific_count > 0, f"task {ident}: no task-specific criteria")
        require(shared_seen == set(templates), f"task {ident}: missing shared acceptance")
        limitations = task.get("limitations")
        require(isinstance(limitations, list) and all(nonempty(x) for x in limitations),
                f"task {ident}: limitations must be a list of nonempty strings")
        evidence = task.get("evidence")
        require(isinstance(evidence, list) and all(nonempty(x) for x in evidence),
                f"task {ident}: completion evidence must be a list of nonempty strings")
        if task.get("status") == "done":
            require(bool(evidence), f"task {ident}: done without evidence")
    for ident, task in by_id.items():
        if task.get("status") == "done":
            require(all(by_id.get(dep, {}).get("status") == "done" for dep in task.get("dependsOn", [])),
                    f"task {ident}: done with unfinished prerequisites")
    return errors


def render_acceptance(criteria):
    lines = []
    for criterion in criteria:
        state = criterion["status"]
        mark = "x" if state == "passed" else " "
        # N/A is deliberately not a checked test. Its condition and rationale stay visible.
        prefix = "- **NOT APPLICABLE**" if state == "not-applicable" else f"- [{mark}] **{state}**"
        lines.append(f"{prefix} `{criterion['id']}` — {criterion['text']}")
        if criterion["conditional"]:
            lines.append(f"  - Applies when: {criterion['conditional']}")
        if criterion["justification"]:
            lines.append(f"  - Justification: {criterion['justification']}")
        for evidence in criterion["evidence"]:
            lines.extend([f"  - Command/check: `{evidence['command']}`.",
                          f"    Outcome: {evidence['outcome']}",
                          f"    Platform/backend: {evidence['platform']}",
                          f"    Reference: {evidence['reference']}"])
    return lines

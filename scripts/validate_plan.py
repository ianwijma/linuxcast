#!/usr/bin/env python3
"""Dependency-free validation of the planning handoff, not of the future app."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors = []

def check(condition, message):
    if not condition:
        errors.append(message)

def read_json(path):
    try:
        return json.loads((ROOT / path).read_text())
    except (OSError, ValueError) as exc:
        errors.append(f"{path}: {exc}")
        return {}

def unique(rows, kind):
    found = {}
    for row in rows:
        ident=row.get("id")
        check(bool(ident), f"{kind}: missing ID")
        check(ident not in found, f"{kind}: duplicate {ident}")
        found[ident]=row
    return found

def anchors(path):
    seen={}
    result=set()
    for line in path.read_text().splitlines():
        if not re.match(r"^#{1,6} ", line):
            continue
        title=re.sub(r"^#+ ", "", line).strip().lower()
        title=re.sub(r"[`*_]", "", title)
        slug=re.sub(r"[^\w\- ]", "", title).replace(" ", "-")
        n=seen.get(slug,0);seen[slug]=n+1
        result.add(slug if n==0 else f"{slug}-{n}")
    return result

def local_ref(target, base, label):
    if target.startswith(("http://","https://","mailto:","linuxcast:","#")):
        if target.startswith("#"):
            check(unquote(target[1:]) in anchors(base), f"{label}: missing anchor {target}")
        return
    target=target.strip("<>")
    pathpart,_,fragment=target.partition("#")
    if not pathpart or "{" in pathpart or pathpart.startswith("/"):
        return
    path=(base.parent/unquote(pathpart)).resolve()
    check(path.is_relative_to(ROOT),f"{label}: escapes repository {target}")
    check(path.exists(),f"{label}: missing local reference {target}")
    if path.is_file() and path.suffix==".md" and fragment:
        check(unquote(fragment) in anchors(path),f"{label}: missing anchor {target}")

def main():
    source_data=read_json("docs/research/sources.json")
    sources=source_data.get("sources",[]) if isinstance(source_data,dict) else source_data
    source_ids=unique(sources,"sources")
    for s in sources:
        check(urlsplit(s.get("url","")).scheme in {"https","http"},f"source {s.get('id')}: invalid URL")
        check(bool(s.get("accessed")) and bool(s.get("title")),f"source {s.get('id')}: missing provenance")
    features=read_json("docs/product/features.json").get("features",[])
    feature_ids=unique(features,"features")
    tasks=read_json("docs/implementation/tasks.json").get("tasks",[])
    task_ids=unique(tasks,"tasks")
    for f in features:
        check(bool(f.get("behaviour")) and bool(f.get("linuxApproach")),f"feature {f['id']}: missing behaviour/disposition")
        for src in f.get("sourceIds",[]):
            check(src in source_ids,f"feature {f['id']}: unknown source {src}")
        if f.get("disposition")=="v1":
            check(bool(f.get("taskIds")),f"feature {f['id']}: no v1 tasks")
        for tid in f.get("taskIds",[]):
            check(tid in task_ids,f"feature {f['id']}: unknown task {tid}")
            if tid in task_ids:
                check(f['id'] in task_ids[tid].get("featureIds",[]),f"feature {f['id']}: nonreciprocal task {tid}")
    valid_states={"planned","in-progress","blocked","done"}
    for t in tasks:
        ident=t['id']
        check(t.get("status") in valid_states,f"task {ident}: invalid status")
        for field in ["title","ownedPaths","featureIds","designRefs","specRefs","inputs","outputs","steps","acceptance","validation"]:
            check(bool(t.get(field)),f"task {ident}: missing {field}")
        check((ROOT/f"docs/implementation/tasks/{ident}.md").exists(),f"task {ident}: missing card")
        for dep in t.get("dependsOn",[]):
            check(dep in task_ids and dep!=ident,f"task {ident}: invalid dependency {dep}")
        for fid in t.get("featureIds",[]):
            check(fid in feature_ids,f"task {ident}: unknown feature {fid}")
            if fid in feature_ids:
                check(ident in feature_ids[fid].get("taskIds",[]),f"task {ident}: nonreciprocal feature {fid}")
        for ref in t.get("specRefs",[])+t.get("designRefs",[]):
            local_ref(ref,ROOT/"README.md",f"task {ident}")
        if t.get("status")=="done":
            check(bool(t.get("evidence")),f"task {ident}: done without evidence")
            check(all(task_ids.get(d,{}).get("status")=="done" for d in t.get("dependsOn",[])),f"task {ident}: done with unfinished prerequisites")
    visiting=set();visited=set()
    def visit(ident,trail):
        if ident in visiting:
            errors.append("task cycle: "+" -> ".join(trail+[ident]));return
        if ident in visited or ident not in task_ids:return
        visiting.add(ident)
        for dep in task_ids[ident].get("dependsOn",[]):visit(dep,trail+[ident])
        visiting.remove(ident);visited.add(ident)
    for ident in task_ids:visit(ident,[])
    release="R1-03"
    release_ancestors=set()
    def collect(ident):
        for dep in task_ids.get(ident,{}).get("dependsOn",[]):
            if dep not in release_ancestors:
                release_ancestors.add(dep);collect(dep)
    collect(release)
    check(release in task_ids,"tasks: missing final release gate R1-03")
    for ident in task_ids:
        check(ident==release or ident in release_ancestors,f"task {ident}: omitted from final release dependency chain")
    markdown=list(ROOT.glob("*.md"))+list((ROOT/"docs").rglob("*.md"))+list((ROOT/".github").glob("*.md"))
    for path in markdown:
        content=re.sub(r"```.*?```","",path.read_text(),flags=re.S)
        for match in re.finditer(r"!?\[[^\]]*\]\((<?[^\s)]+>?)\)",content):
            local_ref(match.group(1),path,str(path.relative_to(ROOT)))
    tokens=read_json("docs/design/tokens.json")
    check(tokens.get("version")==1,"tokens: unsupported version")
    check(set(tokens.get("themes",{}))=={"dark","light"},"tokens: dark/light themes required")
    required={"background","surface","raised","selection","border","text","muted","accent","accentText","focus","danger","warning","success"}
    for name,theme in tokens.get("themes",{}).items():
        check(set(theme)==required,f"tokens {name}: semantic colour roles differ")
        for value in theme.values():check(bool(re.fullmatch(r"#[0-9A-Fa-f]{6}",value)),f"tokens {name}: invalid hex {value}")
    assets=list((ROOT/"docs/design/assets").glob("*.svg"))
    check(len(assets)>=5,"assets: expected icon and four design boards")
    for path in assets:
        try:
            element=ET.parse(path).getroot()
            check(element.tag.endswith("svg"),f"{path.name}: not SVG")
            check(element.find("{http://www.w3.org/2000/svg}title") is not None,f"{path.name}: missing title")
        except ET.ParseError as exc:errors.append(f"{path.name}: {exc}")
    if errors:
        print("Planning validation failed:")
        for err in errors:print("-",err)
        return 1
    print(f"Planning validation passed: {len(sources)} sources, {len(features)} features, {len(tasks)} tasks, {len(markdown)} Markdown files, {len(assets)} SVG assets.")
    print("Local integrity only; external URL availability and future application behaviour are not validated.")
    return 0

if __name__=="__main__":sys.exit(main())

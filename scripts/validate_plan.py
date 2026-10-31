#!/usr/bin/env python3
"""Dependency-free validation of the planning handoff, not of the future app."""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlsplit
from acceptance import validate_registry
from render_tasks import render_files

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

# Canonical token schema (version 2, selected Instrument direction). Mirrors
# packages/ui/src/tokens/index.ts validateTokens: exact key sets per group, no
# arbitrary roles or raw CSS values; only the modal scrim may carry alpha.
TOKEN_BASE_ROLES=["background","surface","raised","selection","border","text","muted","accent","accentText","focus","danger","warning","success"]
TOKEN_INSTRUMENT_ROLES=["divider","controlBorder","selectionRail","userMessage","toolSurface","canvas","canvasDot","scrim","tintDanger","tintWarning","tintSuccess","tintInfo","glyphOnTile"]
TOKEN_GROUPS={
    "font":["ui","mono","emoji"],"fontFeature":["ui","numeric"],"fontWeight":["regular","medium","semibold"],
    "fontSize":["caption","body","emphasis","panelTitle","workspaceTitle"],
    "lineHeight":["caption","body","emphasis","panelTitle","workspaceTitle","prose"],
    "letterSpacingEm":["caption","groupCaption","workspaceTitle"],"radius":["shell","popover","row","keycap"],
    "layout":["launcherWidth","launcherMaxHeight","headerHeight","rowHeight","footerHeight","actionPanelWidth",
        "glyphTrack","glyphTile","glyphTileSmall","glyphInner","glyphInnerSmall","lineIcon",
        "selectionRailWidth","selectionRailInset","focusWidth","hairline",
        "groupCaptionHeight","keyColumn","keycapHeight","keycapMinWidth","controlHeight","compactControlHeight",
        "actionRowHeight","actionFilterHeight","statePlateMaxWidth","listMinWidth","detailMinWidth","gridCellMin",
        "workspaceHeaderHeight","workspaceSidebarWidth","workspaceInspectorWidth","workspaceMinWidth",
        "proseMeasure","composerMinHeight","workflowNodeWidth","workflowPortSize","canvasDotSpacing","narrowBreakpoint"],
    "ratio":["listDetail","listDetailMin","listDetailMax","listDetailStep"],"strokePx":["glyph","lineIcon","edge"],
    "motion":["stateMs","panelMs","reducedMotion","easing","panelOffset"],
    "glyphTiles":["command","files","clipboard","quicklink","ai","workflow","notes","system"],
}
TOKEN_TOP=["version","spacing","themes","elevation",*TOKEN_GROUPS]
TOKEN_SPACING=[4,8,12,16,20,24,32]
TOKEN_ALPHA_ROLES={"scrim"}
def token_errors(tokens):
    """Exact mirror of validateTokens in packages/ui/src/tokens/index.ts (same keys, bounds and
    integer/finite rules). Shared cases in packages/ui/src/tokens/schema-cases.json keep both in parity."""
    errors=[]
    fail=errors.append
    def is_num(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
    def is_int(v):return is_num(v) and float(v).is_integer()
    def exact(path,value,keys):
        if not isinstance(value,dict):
            fail(f"tokens {path}: expected object");return False
        if set(value)!=set(keys):
            fail(f"tokens {path}: keys differ");return False
        return True
    def integer(path,value,low,high):
        if not (is_int(value) and low<=value<=high):fail(f"tokens {path}: expected integer {low}-{high}")
    def number(path,value,low,high):
        if not (is_num(value) and low<=value<=high):fail(f"tokens {path}: expected number {low}-{high}")
    if not exact("top level",tokens,TOKEN_TOP):return errors
    t=tokens
    if not (is_int(t["version"]) and t["version"]==2):fail("tokens: unsupported version")
    safe=re.compile(r"[A-Za-z0-9 ,\"'\-.]+")
    for group in ["font","fontFeature"]:
        if exact(group,t[group],TOKEN_GROUPS[group]):
            for key,value in t[group].items():
                if not (isinstance(value,str) and safe.fullmatch(value)):fail(f"tokens {group}.{key}: unsafe value")
    if exact("fontWeight",t["fontWeight"],TOKEN_GROUPS["fontWeight"]):
        for key,value in t["fontWeight"].items():
            integer(f"fontWeight.{key}",value,100,900)
            if is_num(value) and value%100!=0:fail(f"tokens fontWeight.{key}: invalid weight")
    sizes=t["fontSize"] if exact("fontSize",t["fontSize"],TOKEN_GROUPS["fontSize"]) else None
    if sizes:
        for key,value in sizes.items():integer(f"fontSize.{key}",value,8,64)
    if exact("lineHeight",t["lineHeight"],TOKEN_GROUPS["lineHeight"]):
        for key,value in t["lineHeight"].items():
            integer(f"lineHeight.{key}",value,8,96)
            size=sizes.get("body" if key=="prose" else key) if sizes else None
            if is_num(value) and is_num(size) and value<size:fail(f"tokens lineHeight.{key}: smaller than its font size")
    if exact("letterSpacingEm",t["letterSpacingEm"],TOKEN_GROUPS["letterSpacingEm"]):
        for key,value in t["letterSpacingEm"].items():number(f"letterSpacingEm.{key}",value,-0.1,0.2)
    spacing=t["spacing"]
    if not (isinstance(spacing,list) and len(spacing)==len(TOKEN_SPACING) and all(is_num(v) and v==e for v,e in zip(spacing,TOKEN_SPACING))):
        fail("tokens spacing: the 4 px scale is fixed")
    if exact("radius",t["radius"],TOKEN_GROUPS["radius"]):
        for key,value in t["radius"].items():integer(f"radius.{key}",value,0,32)
    if exact("layout",t["layout"],TOKEN_GROUPS["layout"]):
        for key,value in t["layout"].items():integer(f"layout.{key}",value,1,4096)
    if exact("ratio",t["ratio"],TOKEN_GROUPS["ratio"]):
        ratio=t["ratio"]
        for key,value in ratio.items():number(f"ratio.{key}",value,0.01,0.99)
        if not all(is_num(ratio[k]) for k in ["listDetail","listDetailMin","listDetailMax"]) or not (ratio["listDetailMin"]<=ratio["listDetail"]<=ratio["listDetailMax"]):
            fail("tokens ratio.listDetail: outside min/max")
        if not (is_num(ratio["listDetailStep"]) and ratio["listDetailStep"]<=0.1):fail("tokens ratio.listDetailStep: too large")
    if exact("strokePx",t["strokePx"],TOKEN_GROUPS["strokePx"]):
        for key,value in t["strokePx"].items():number(f"strokePx.{key}",value,0.5,4)
    if exact("motion",t["motion"],TOKEN_GROUPS["motion"]):
        motion=t["motion"]
        integer("motion.stateMs",motion["stateMs"],1,400)
        integer("motion.panelMs",motion["panelMs"],1,400)
        integer("motion.panelOffset",motion["panelOffset"],0,8)
        if motion["reducedMotion"]!="opacity-only-or-none":fail("tokens motion.reducedMotion: must be opacity-only-or-none")
        easing=motion["easing"]
        if not (isinstance(easing,list) and len(easing)==4 and all(is_num(v) for v in easing) and 0<=easing[0]<=1 and 0<=easing[2]<=1):
            fail("tokens motion.easing: expected cubic-bezier control points")
    hex6=re.compile(r"#[0-9A-Fa-f]{6}");hex8=re.compile(r"#[0-9A-Fa-f]{8}")
    if exact("glyphTiles",t["glyphTiles"],TOKEN_GROUPS["glyphTiles"]):
        for key,value in t["glyphTiles"].items():
            if not (isinstance(value,str) and hex6.fullmatch(value)):fail(f"tokens glyphTiles.{key}: expected opaque hex")
    roles=TOKEN_BASE_ROLES+TOKEN_INSTRUMENT_ROLES
    if not (isinstance(t["themes"],dict) and set(t["themes"])=={"dark","light"}):fail("tokens: dark/light themes required")
    else:
        for name,theme in t["themes"].items():
            if not isinstance(theme,dict) or set(theme)!=set(roles):
                fail(f"tokens {name}: semantic colour roles differ {sorted(set(theme)^set(roles)) if isinstance(theme,dict) else ''}");continue
            for role,value in theme.items():
                pattern=hex8 if role in TOKEN_ALPHA_ROLES else hex6
                if not (isinstance(value,str) and pattern.fullmatch(value)):fail(f"tokens {name}: invalid hex {value} for {role}")
    if exact("elevation",t["elevation"],["dark","light"]):
        for name,levels in t["elevation"].items():
            if not exact(f"elevation.{name}",levels,["shell","popover","highlight"]):continue
            for level,layers in levels.items():
                if not (isinstance(layers,list) and 1<=len(layers)<=4):
                    fail(f"tokens elevation.{name}.{level}: expected 1-4 layers");continue
                for index,layer in enumerate(layers):
                    path=f"elevation.{name}.{level}[{index}]"
                    keys=["y","blur","spread","color"]+(["inset"] if isinstance(layer,dict) and "inset" in layer else [])
                    if not exact(path,layer,keys):continue
                    integer(f"{path}.y",layer["y"],-8,64)
                    integer(f"{path}.blur",layer["blur"],0,96)
                    integer(f"{path}.spread",layer["spread"],0,8)
                    if not (isinstance(layer["color"],str) and hex8.fullmatch(layer["color"])):fail(f"tokens {path}: shadow colour must be #RRGGBBAA")
                    if "inset" in layer and layer["inset"] is not True:fail(f"tokens {path}: inset must be true when present")
    if isinstance(t["layout"],dict) and isinstance(t["themes"],dict) and isinstance(t["themes"].get("dark"),dict):
        kebab=lambda v:re.sub(r"[A-Z]",lambda m:"-"+m.group(0).lower(),v)
        theme_roles={kebab(r) for r in t["themes"]["dark"]}
        for key in t["layout"]:
            if kebab(key) in theme_roles:fail(f"tokens layout.{key}: collides with theme role --lc-{kebab(key)}")
    return errors

def validate_tokens(tokens,check):
    for message in token_errors(tokens):check(False,message)

def main():
    errors.clear()
    source_data=read_json("docs/research/sources.json")
    sources=source_data.get("sources",[]) if isinstance(source_data,dict) else source_data
    source_ids=unique(sources,"sources")
    for s in sources:
        check(urlsplit(s.get("url","")).scheme in {"https","http"},f"source {s.get('id')}: invalid URL")
        check(bool(s.get("accessed")) and bool(s.get("title")),f"source {s.get('id')}: missing provenance")
    features=read_json("docs/product/features.json").get("features",[])
    feature_ids=unique(features,"features")
    registry=read_json("docs/implementation/tasks.json")
    acceptance_errors=validate_registry(registry)
    errors.extend(acceptance_errors)
    if acceptance_errors:
        print("Planning validation failed:")
        for err in errors: print("-", err)
        return 1
    tasks=registry.get("tasks",[])
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
    if not errors:
        for name, expected in render_files(registry).items():
            path=ROOT/name
            check(path.exists() and path.read_text()==expected,
                  f"{name}: stale generated file; run python3 scripts/render_tasks.py")
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
    validate_tokens(tokens,check)
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

#!/usr/bin/env python3
"""Merge subsystem-owned source records into the searchable source register."""
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
folder=root/"docs/research"
records=[]
for path in sorted(folder.glob("sources-*.json")):
    records.extend(json.loads(path.read_text()))
ids=[x["id"] for x in records]
if len(ids)!=len(set(ids)):
    raise SystemExit("Duplicate source IDs; resolve ownership before merging")
result={"schemaVersion":1,"snapshot":"2026-10-22","method":"Official documentation/source research and limited website/client-image visual inspection; no proprietary native runtime execution. Subsystem fragments preserve ownership; multiple records may cite the same URL in different contexts.","sources":records}
(folder/"sources.json").write_text(json.dumps(result,indent=2)+"\n")
print(f"Merged {len(records)} source records ({len(set(x['url'] for x in records))} distinct URLs)")

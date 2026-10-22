# Immutable unsigned lifecycle source snapshot

Local-only preparation: signed git archive d8b6 plus exactly the reviewed5file
43922 overlay. Three runtime inputs change, so the resulting source is unsigned
and does not match the signed baseline runtime. No execution is authorized by
these files. Source/authority/build manifest are exact; root and006 review plus
separate explicit reservation are required before any guest action. Comparison
against original git archive verifies455files/exactly5changes; new uncommitted
evidence and other working-tree state are absent. Frozen bun.lock remains the
dependency authority. Historical immutable snapshots remain untouched.

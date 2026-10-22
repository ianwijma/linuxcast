# Locked decisions

Accepted 22 October 2026. Change these only through a reviewed specification update; a product-scope change requires the user's agreement.

| ID | Decision | Consequence |
|---|---|---|
| ADR-001 | Debian 13 amd64; GNOME and KDE; Wayland and X11 | Maintain four integration sessions and operation-level capabilities. |
| ADR-002 | Electron/React/TypeScript/Tailwind with Rust helpers | Keep native code outside renderer; one client .deb. |
| ADR-003 | GPL-3.0-only, original Linuxcast brand | Preserve third-party licence/provenance records. |
| ADR-004 | Native formats and declarative SDK | No Raycast SDK or Alfred package importer; host renders extension UI. |
| ADR-005 | All agreed local features in 1.0 | Alpha milestones are not a scope reduction. |
| ADR-006 | Visual workflows in 1.0 | Runtime and editor develop in parallel against frozen graph contracts. |
| ADR-007 | Local first; no v1 cloud account/backend | Static catalogue and optional external integrations are allowed. |
| ADR-008 | One global provider/model for ordinary AI | Per-plugin/purpose overrides are future work; harnesses are explicit separate runtimes. |
| ADR-009 | Local Whisper speech | Model/language assets download only after explicit selection. |
| ADR-010 | Optional desktop/browser companions | Show capability/remediation states when absent. |
| ADR-011 | Optional privileged keyboard service | Disabled package install; explicit polkit consent, least privilege, independent recovery gate. This supersedes the early research suggestion to omit privileged input. |
| ADR-012 | Mandatory extension isolation | Missing sandbox support disables code execution; no quiet unsafe fallback. |
| ADR-013 | Canonical design system | Every user-facing task and PR references the design document. |
| ADR-014 | One storage owner and durable run journal | No speculative replay of uncertain external effects after crashes. |

Each new decision record must state context, chosen behaviour, rejected alternatives, impacted feature/task IDs, migration/compatibility implications and acceptance checks. Small routine implementation choices already constrained by these decisions do not require another user approval.

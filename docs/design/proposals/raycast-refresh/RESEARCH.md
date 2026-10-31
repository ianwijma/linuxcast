# Raycast design re-exploration

Inspected 1 November 2026. This is a design proposal input, not a change to the normative [design contract](../../DESIGN.md) or [tokens](../../tokens.json).

## Evidence

| Official source | What was inspected | Implication for Linuxcast |
| --- | --- | --- |
| [Current website](https://www.raycast.com/) | Current page content and its file-search product image | Separate promotional red artwork and spacious marketing composition from quiet, compact application surfaces. |
| [Raycast 2 technical article](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast), published 14 May 2026 | Article and linked Windows launcher screenshot, visually inspected | Strong query header, grouped icon-leading results, neutral selection, aligned accessories, restrained border and compact footer. |
| [Windows launcher source image](https://www.raycast.com/uploads/blog-technical-deep-dive-new-raycast/raycast-2-windows.png) | Downloaded and visually inspected; source artwork is not committed | Typography and alignment carry the hierarchy; colourful small icons aid scanning without tinting the whole row. Blur is an observed platform treatment, not a Linux dependency. |
| [File-search source image](https://www.raycast.com/_next/image?q=90&url=%2F_next%2Fstatic%2Fimmutable%2Fmedia%2Ffile-search.1h2o4dmp-4j8e.png&w=3840) | Downloaded and visually inspected | List/detail divider, selected row, generous preview area and metadata hierarchy. Website crop is not a full client measurement. |
| [New in v2 manual](https://manual.raycast.com/new-in-v2) | Current public documentation | Recheck the current product rather than relying only on older references. |
| [List API](https://developers.raycast.com/api-reference/user-interface/list) | Component documentation | Sections, accessories, search, loading and detail belong to a shared host vocabulary. This is interaction evidence, not SDK compatibility. |

The current home page presents AI chat with a history sidebar, tool activity and a rounded composer. This content observation complements the existing client references; no live Raycast app, private source, native accessibility tree or proprietary CSS was accessed. No new screenshot measurements or performance claims are inferred from these sources.

## Design synthesis

1. Make the query and selected command the strongest visual landmarks. Keep category, source, path and shortcut secondary, but readable.
2. Use the same row, keycap, toolbar and action language for built-ins, native extension views and workflows. A larger workspace changes composition, not the basic visual vocabulary.
3. Keep actions close to the selected item and make their keyboard path visible. Use Linux Ctrl/Alt/Super labels.
4. Let chat prose breathe; distinguish tool activity and pending approval from an assistant answer. Show one globally configured provider/model.
5. Treat loading, denied, unsupported and interrupted states as designed surfaces with a clear next action. Never suggest a mock performed a system operation.
6. Use original Linuxcast identity and synthetic content. Opaque dark/light surfaces are the baseline. Do not transplant Raycast branding, macOS controls, proprietary illustrations or promotional gradients.

## Limits

Visual similarity is not evidence of native focus, compositor integration, screen-reader support, latency or capability availability. This work produces reviewable design artifacts. Debian 13 GNOME/KDE Wayland/X11, actual Electron assistive technology and implementation acceptance remain separate gates.

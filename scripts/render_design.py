#!/usr/bin/env python3
"""Generate original, deterministic SVG planning examples; no app implementation."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/design/assets"
OUT.mkdir(parents=True, exist_ok=True)

def svg(name, title, body, width=1280, height=900, light=False):
    bg = "#f2f3f6" if light else "#111216"
    text = "#1c1d24" if light else "#f5f5f7"
    muted = "#535866" if light else "#adb0bb"
    body = body.replace('<text ', f'<text fill="{text}" font-size="16" font-family="DejaVu Sans,Arial,sans-serif" ')
    data = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">Original Linuxcast planning mockup. Proposed layout, not a screenshot of working software.</desc>
<style>text{{font-family:Inter,DejaVu Sans,Arial,sans-serif;fill:{text};font-size:16px}}.muted{{fill:{muted};font-size:13px}}.h1{{font-size:32px;font-weight:600}}.h2{{font-size:20px;font-weight:600}}.mono{{font-family:DejaVu Sans Mono,monospace;font-size:12px}}.coral{{fill:#ff786e}}</style>
<rect width="100%" height="100%" fill="{bg}"/>
{body}
</svg>'''
    (OUT / name).write_text(data + "\n")

def rect(x,y,w,h,fill="#1c1d22",r=16,stroke="#454751"):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}"/>'

def txt(x,y,s,cls=""):
    return f'<text x="{x}" y="{y}" class="{cls}">{escape(s)}</text>'

def line(x1,y1,x2,y2,colour="#454751"):
    return f'<path d="M{x1} {y1}H{x2}" stroke="{colour}"/>' if y1==y2 else f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{colour}" fill="none"/>'

def key(x,y,s):
    w=max(30,len(s)*8+16)
    return rect(x,y-18,w,25,"#35363f",4)+txt(x+8,y,s,"mono")

header=txt(48,58,"Linuxcast / launcher and actions","h1")+txt(48,88,"Original design specification · dark theme · compact, keyboard-first hierarchy","muted")
b=header+rect(48,130,720,516)+txt(76,164,"Search applications, commands and files…")+key(682,164,"Esc")+line(48,186,768,186)+txt(72,216,"FAVOURITES","muted")
rows=[("Terminal","Application","Enter"),("Search Files","Command","Ctrl F"),("Project notes","Note · updated today",""),("Clipboard History","Command",""),("Quick AI","Ask with your selected provider","Tab")]
for i,(title,sub,shortcut) in enumerate(rows):
    y=232+i*64
    if i==0:b+=rect(60,y,696,56,"#35363f",8,"#35363f")
    b+=rect(76,y+12,32,32,"#25262d",8)+txt(84,y+34,[">_","F","N","C","✦"][i])+txt(124,y+23,title)+txt(124,y+44,sub,"muted")
    if shortcut:b+=key(654,y+34,shortcut)
b+=line(48,600,768,600)+txt(72,628,"Terminal","muted")+txt(410,628,"Open")+key(464,628,"Enter")+txt(540,628,"Actions")+key(620,628,"Ctrl K")
b+=rect(800,232,280,306,"#25262d",12)+txt(820,266,"Search actions…","muted")+line(800,284,1080,284)
for i,s in enumerate(["Open application","Open new window","Assign hotkey","Add alias","Remove favourite"]):
    y=296+i*42
    if i==0:b+=rect(808,y,264,36,"#35363f",8,"#35363f")
    b+=txt(824,y+24,s)
b+=txt(800,578,"ACTIONS","muted")+txt(800,605,"Stable primary action; searchable")+txt(800,631,"secondary actions and shortcuts.")
b+=txt(48,718,"Design rules","h2")+txt(48,752,"01  Fine border + opaque fallback")+txt(48,784,"02  Neutral selection, explicit focus")+txt(640,752,"03  Icons, subtitles and accessories align")+txt(640,784,"04  Shared footer across all command views")+txt(48,852,"Proposed example · not an application screenshot","muted")
svg("launcher-actions.svg","Linuxcast launcher and action panel",b)

b=txt(48,58,"Linuxcast / focused workspaces","h1")+txt(48,88,"Shared tokens and actions extend into chat and the visual workflow editor","muted")
b+=rect(48,124,1184,310)+rect(48,124,260,310,"#18191e",16)+txt(70,158,"AI Chat","h2")+txt(70,194,"Search chats…","muted")+txt(70,236,"PROJECTS","muted")+rect(60,250,236,38,"#35363f",8)+txt(76,275,"Linuxcast")+txt(76,316,"Research notes","muted")+txt(76,354,"TODAY","muted")+txt(76,388,"Plan a workflow")
b+=txt(334,158,"Plan a workflow","h2")+txt(950,158,"OpenRouter · selected model","muted")+line(308,180,1232,180)+rect(824,198,380,42,"#35363f",12)+txt(842,225,"Summarise these notes into tasks")+txt(338,278,"I can turn the attached notes into a checklist.")+txt(338,306,"Review the source and destination before saving.","muted")+rect(330,350,878,64,"#25262d",12)+txt(350,379,"Ask a follow-up…","muted")+txt(350,400,"+ Attachment    Project instructions","muted")+key(1120,388,"Enter")
b+=rect(48,474,1184,340)+txt(70,508,"Workflow: selected text → summary","h2")+key(1078,508,"Test run")+line(48,528,1232,528)+rect(60,540,188,260,"#18191e",8)+txt(78,568,"Node palette","h2")
for i,s in enumerate(["Triggers","Inputs and forms","Actions","Conditions","AI","Outputs"]):b+=txt(78,604+i*32,s,"muted")
for x,title,sub in [(280,"Hotkey","Selection context"),(516,"AI prompt","Global model"),(752,"Copy result","Clipboard action")]:
    b+=rect(x,606,200,104,"#25262d",12)+txt(x+16,638,title)+txt(x+16,668,sub,"muted")+f'<circle cx="{x}" cy="658" r="5" fill="#ff786e"/><circle cx="{x+200}" cy="658" r="5" fill="#ff786e"/>'
b+=line(480,658,516,658,"#ff786e")+line(716,658,752,658,"#ff786e")+rect(974,540,244,260,"#18191e",8)+txt(992,568,"Inspector","h2")+txt(992,602,"AI prompt","muted")+txt(992,638,"Input: selected text")+txt(992,674,"Output: text")+txt(992,710,"Status: ready")+txt(992,758,"No run has started","muted")+txt(48,860,"Native graph data, host-rendered views, inspectable permission and execution state","muted")
svg("workspaces.svg","Linuxcast chat and workflow editor",b)

b=txt(48,58,"Linuxcast / component vocabulary","h1")+txt(48,88,"List/detail, grids, forms and persistent state communication share one visual grammar","muted")
b+=rect(48,128,560,310)+txt(72,166,"Clipboard History","h2")+txt(72,198,"Search saved clips…","muted")+line(48,216,608,216)+rect(60,230,240,50,"#35363f",8)+txt(76,260,"Meeting notes")+txt(76,310,"Image · 1280 × 720","muted")+txt(76,358,"Copied file paths","muted")+line(320,216,320,420)+txt(340,252,"Preview","h2")+txt(340,292,"A useful excerpt remains")+txt(340,320,"readable before pasting.")+txt(340,374,"Text · today","muted")
b+=rect(640,128,592,310)+txt(664,166,"Emoji and symbols","h2")+txt(664,198,"FREQUENT","muted")
for i,s in enumerate(["★","✓","→","+","♫","#","∞","@"]):
    x=664+(i%4)*136;y=220+(i//4)*88
    b+=rect(x,y,116,72,"#35363f" if i==0 else "#25262d",8,"#a6b9ff" if i==0 else "#454751")+txt(x+45,y+44,s,"h2")
b+=rect(48,472,560,324)+txt(72,512,"Create quicklink","h2")+txt(72,548,"Name","muted")+rect(72,560,512,40,"#25262d",8)+txt(88,586,"Search documentation")+txt(72,634,"URL template","muted")+rect(72,646,512,40,"#25262d",8)+txt(88,672,"https://example.org/?q={{vars.query}}","mono")+txt(72,720,"Argument values are URL encoded.","muted")+rect(468,744,116,34,"#ff786e",8,"#ff786e")+'<text x="500" y="767" style="fill:#151519">Save</text>'
b+=rect(640,472,592,324)+txt(664,512,"State examples","h2")
for i,(title,sub,col) in enumerate([("Permission required","Enable the desktop component to continue.","#f4c779"),("No matching results","Try a different query or open search settings.","#adb0bb"),("Response interrupted","Partial text was kept. Retry is an explicit action.","#ff8f91")]):
    y=552+i*76
    b+=f'<circle cx="674" cy="{y}" r="5" fill="{col}"/>'+txt(690,y+5,title)+txt(690,y+30,sub,"muted")
b+=txt(48,856,"Never disguise unsupported capabilities, failed paste or interrupted output as success.","muted")
svg("components.svg","Linuxcast component and state examples",b)

b=txt(48,58,"Linuxcast / settings and consent","h1")+txt(48,88,"Light theme · permissions remain legible and specific","muted")+rect(48,128,1184,660,"#ffffff")+rect(48,128,240,660,"#f7f7f9")+txt(72,172,"Settings","h2")
for i,s in enumerate(["General","Commands","AI provider","Integrations","Keyboard input","Privacy and data"]):
    y=224+i*48
    if i==4:b+=rect(60,y-26,216,40,"#e8eaf0",8,"#e8eaf0")
    b+=txt(76,y,s)
b+=txt(324,174,"Keyboard input","h2")+txt(324,214,"Optional system integration for Hyper and typed snippets.","muted")+rect(324,242,864,132,"#f7f7f9",12,"#b9bdc8")+txt(348,276,"Disabled")+txt(348,308,"This component can observe physical keyboard input and emit keystrokes.")+txt(348,340,"Enable only the keyboards and features you want to use.","muted")
b+=txt(324,418,"Selected keyboards","h2")+rect(324,440,864,52,"#f7f7f9",8,"#b9bdc8")+txt(344,472,"□  Built-in keyboard")+rect(324,504,864,52,"#f7f7f9",8,"#b9bdc8")+txt(344,536,"□  USB keyboard")+txt(324,600,"Features:  □ Hyper remapping    □ Typed snippet expansion")+txt(324,642,"Emergency disarm: Left Ctrl + Right Ctrl + Escape","muted")+txt(324,678,"Unknown input fields may require manual insertion.","muted")+rect(1002,716,186,42,"#b92f32",8,"#b92f32")+'<text x="1020" y="743" style="fill:#ffffff">Enable selected…</text>'+txt(48,850,"Installation never starts keyboard capture. Administrative consent follows this explanation.","muted")
svg("settings-light.svg","Linuxcast light settings and keyboard consent",b,light=True)

b=txt(48,58,"Linuxcast / everyday productivity","h1")+txt(48,88,"Notes and agenda share search, typography, actions and local-data status","muted")
b+=rect(48,128,760,660)+rect(48,128,220,660,"#18191e",16)+txt(72,170,"Notes","h2")+txt(72,206,"Search notes…","muted")+rect(60,230,196,48,"#35363f",8)+txt(76,260,"Project journal")+txt(76,308,"Meeting checklist","muted")+txt(76,352,"Quick note","muted")
b+=txt(296,176,"Project journal","h1")+txt(296,214,"Saved locally · today","muted")+line(288,236,786,236)+txt(296,284,"Next steps","h2")+txt(296,326,"Define a useful first workflow.")+txt(296,362,"Keep the keyboard path consistent.")+txt(296,416,"☐ Review the task dependencies")+txt(296,454,"☐ Test the supported desktop sessions")+txt(296,520,"Type / for blocks and actions","muted")+txt(296,750,"Markdown export")+key(646,750,"Ctrl K")
b+=rect(840,128,392,660)+txt(864,170,"Agenda","h2")+txt(864,208,"Thursday, 22 October","muted")+line(840,236,1232,236)+txt(864,278,"UP NEXT","muted")+rect(856,300,360,144,"#25262d",12)+txt(876,336,"Project review","h2")+txt(876,372,"14:00–14:30 · Local calendar","muted")+rect(876,396,104,32,"#35363f",8)+txt(894,419,"Details")+txt(864,496,"Team calendar","h2")+txt(864,532,"Read-only subscription","muted")+txt(864,572,"Event editing is unavailable for")+txt(864,600,"this source.")+txt(864,750,"Refresh agenda","muted")
b+=txt(48,850,"Content remains local. Calendar source capabilities determine which actions are offered.","muted")
svg("productivity.svg","Linuxcast notes and calendar design",b)

icon='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="title"><title id="title">Original Linuxcast command cards icon</title><rect x="12" y="12" width="232" height="232" rx="52" fill="#1c1d22"/><rect x="51" y="49" width="155" height="42" rx="12" fill="#35363f"/><rect x="40" y="99" width="155" height="42" rx="12" fill="#454751"/><rect x="29" y="149" width="155" height="58" rx="14" fill="#ff786e"/><path d="m54 166 14 12-14 12m27 0h24" stroke="#151519" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'''
(OUT/"linuxcast-icon.svg").write_text(icon+"\n")
print(f"Rendered 6 original SVG assets to {OUT.relative_to(ROOT)}")

---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Earshot app screen

Scope: the single app screen (index.html). Mode: Operate.
Audience/job: the owner demoing image-over-sound to people in a room; anyone trying it alone with loopback. Task: pick an image, send it out loud, watch the other device draw it live.
Constraints: plain web controls; works without mic (loopback); honest analog noise.
Memorable moment: the receive sheet filling in line by line under a red scan rule while the hertz readout ticks.

## Direction contract

THESIS: Earshot is a telegram office for pictures: one form sends, one form receives, line by line. It refuses the dark audio-utility card grid with a glowing blue record button.
OWN-WORLD: Buff form stock (#efe4c8) ground, form-print blue (#1f4e8c) for every rule, label and primary control, cancel red (#c8321e) for live/scan/stamp states, ink black for data. Rules at one device pixel, no radius, no shadow. Archivo Narrow caps for form heads, Archivo for UI, JetBrains Mono for figures.
STORY: The visitor sees two halves of a form, understands one sends and one receives, presses Send out loud, and watches the picture arrive while hearing it.
FIRST VIEWPORT: 56px top bar (Earshot, input source, mic state, sample rate). Two equal panes, Transmit left and Receive right, each with a ruled header row of four boxes (mode, frame, length, output / heard, line, signal, started), the image sheet, then a control row; Transmit carries the live Hz readout in red at the right. A waterfall band spans the width below. The received-picture log runs as stamped strips under it.
FORM: assigned direction, position 6 of the grounded list (Telegram Office). seed:8de0210b1ff84fd2. Raises: stamped states that never disappear (ticket wallet); one-device-pixel rules (centre rail); live monospace Hz readout (variable font specimen). Signature interaction: line-by-line receive with a red scan rule and the receive log stamping RECEIVED / PARTIAL / VOID.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

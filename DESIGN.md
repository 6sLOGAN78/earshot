---
name: Earshot
world: Telegram Office (pictures handed over the counter: one form sends, one form receives)
colors:
  paper: "#efe4c8"       # ground
  paper-2: "#e5d7b2"     # empty sheet, sample wells
  paper-3: "#f6efdc"     # log strips
  blue: "#1f4e8c"        # form print: every rule, label, primary control
  blue-deep: "#163a6a"   # hover, secondary text
  red: "#c0301c"         # live state: scan rule, Hz readout, focus ring, PARTIAL/VOID stamps
  ink: "#1b1a17"         # data values
typography:
  ui: "Archivo Variable 15px/1.45, wdth 100"
  heads: "Archivo Variable 720, wdth 72%, uppercase, +0.16em"
  labels: "Archivo Variable 620 11px, wdth 85%, uppercase, +0.11em"
  figures: "JetBrains Mono Variable 500, tabular-nums"
rules: "1px solid blue. No radius, no shadow, anywhere."
motion: "160ms ease-out (0.16,1,0.3,1) for state; one authored moment: the stamp landing (260ms)."
---

# Earshot design system

**Surface:** one Operate screen. The page is a telegram form split in two: Transmit on the left, Receive on the right. A printed waterfall band runs underneath, and a log of stamped strips sits below that.

## Rules
- Every structural line is 1px form blue. Boxes are ruled header cells (label in small caps, value in mono).
- Blue means form and action. Red means something is live: the scan rule, the hertz readout, focus. Red is never decoration.
- States stamp themselves and never disappear: RECEIVED (blue), PARTIAL (red), VOID (red, struck through).
- The waterfall is printed rather than lit: paper → blue → ink as intensity rises.
- Controls are plain web controls: buttons, selects, a two-way segmented toggle, and file inputs inside labelled buttons.
- Narrow screens (≤920px) stack the panes, and the header boxes become a 2×2 grid.

# BAILOUT
**In buildings, there's no bailout.**

🔗 **Live demo:** https://no-bailout-buildings.lovable.app

Built at **NCSEA + AECtech | The Big Build** hackathon (San Francisco, 2026) by Valerie Jimenez.

## The idea
In *The Big Short*, a Jenga tower shows how stacking risk makes a whole market fragile. AAA blocks on top, junk underneath. Pull the wrong block and everything comes down.

**Value engineering is Jenga with a real building.** Every steel cut saves money, and every cut pulls a block.

Bailout rates every beam and column like a bond, based on its demand/capacity ratio (D/C):

| Rating | D/C |
|---|---|
| AAA | < 0.5 |
| AA / A | 0.5 – 0.7 |
| BBB | 0.7 – 0.9 |
| JUNK | 0.9 – 1.0 |
| D (default) | > 1.0 |

## How it works
- A 6-story, 3-bay steel frame (W14 columns, W18 beams, HSS end-bay bracing) with 80 psf dead and 50 psf live loads.
- A direct stiffness solver runs in the browser and re-analyzes the frame after every pull.
- **LOAD PATH view.** Animated force flow shows compression and tension, load arrows, and ground reactions. Each pull animates the reroute and labels members with "+X% load."
- **VE P&L ticker** at an illustrative $4,500 per ton of steel saved.
- **MARKET CRASH.** When no load path to the ground is left, the app shows the failure cost (replacement, demolition, litigation) next to the savings.
- **Short the Building.** Bet on the pull that brings it down.
- A 2D/3D view (React Three Fiber), a trading-terminal UI, and Undo and Reset.

## Demo
1. Open the live demo and click **ENTER TERMINAL**.
2. Turn on **FLOW**.
3. Pull ground columns C1-1, C1-3, C1-2, C1-4, then X1-1 and watch the ratings fall until the crash.

## Stack
Lovable, React, TypeScript, Vite, Tailwind, React Three Fiber.

## Disclaimer
This is an educational proof of concept. All numbers are **illustrative estimates**, not engineering design, and nothing here involves real money. It has no affiliation with or endorsement from *The Big Short* (2015) or its creators. Film stills are used for commentary.

# Crimson Castle — Development Roadmap

**Current release:** 1.0.4  
**Next planned milestone:** 1.1.0  
**Status:** Planning  
**Note:** This roadmap is a working plan, not a promise that every item will ship in 1.1.0. Priorities may change based on testing and player feedback.

## 1.1.0 — Stability, building, and combat

The goal of 1.1.0 is to make the core fortress-building and battle loop more reliable and satisfying before expanding the game's scope.

### Priority 1 — Core stability
- [ ] Fix fortress movement, floating, and unexpected settling after supports are removed.
- [ ] Prevent nodes and structures from clipping through or passing below the ground.
- [ ] Check that connected structures remain stable when beams or supports break.
- [ ] Fix reproducible crashes, softlocks, and major gameplay bugs reported by testers.

### Priority 2 — Building improvements
- [ ] Make node-to-node building and snapping feel consistent.
- [ ] Make it clear which nodes and struts are connected before placing a structure.
- [ ] Improve deletion and repair feedback so players can understand what will be affected.
- [ ] Review material costs and building distances for a fair, readable building experience.

### Priority 3 — Weapons and combat
- [ ] Make aiming and manual firing feel responsive and predictable.
- [ ] Verify selecting up to three cannons with Ctrl + click, aiming them together, and firing them together.
- [ ] Improve projectile collision and damage feedback.
- [ ] Make destroyed weapons and damaged structures behave consistently.

### Priority 4 — AI and match flow
- [ ] Test that the enemy AI builds, repairs, and expands reliably.
- [ ] Verify the AI can recover and maintain at least one cannon when possible.
- [ ] Improve AI decision-making so it does not waste resources or build unusable structures.
- [ ] Test match start, pause, restart, victory, and defeat flows.

### Priority 5 — Polish and accessibility
- [ ] Improve tooltips and short explanations for building and weapon controls.
- [ ] Make selection, damage, repair, and placement states easier to see.
- [ ] Review menus and HUD layout at common window sizes.
- [ ] Check audio and visual feedback for important gameplay events, if present.

## Testing checklist

Before publishing 1.1.0:
- [ ] Start a new match and complete a full battle.
- [ ] Build, extend, and delete sections of a fortress.
- [ ] Break supports and check that physics and ground collision behave correctly.
- [ ] Place, select, aim, and fire one cannon.
- [ ] Select multiple cannons and fire them together.
- [ ] Destroy enemy weapons and confirm AI recovery behavior.
- [ ] Test pause, resume, restart, victory, and defeat.
- [ ] Install the Windows setup build on a clean test environment.
- [ ] Test the portable ZIP on a clean Windows environment.
- [ ] Confirm the in-game update check reports the published version correctly.

## Release and community tasks

- [ ] Collect player feedback and turn reproducible problems into GitHub issues.
- [ ] Capture screenshots of real gameplay for the itch.io page.
- [ ] Publish release notes describing the changes and known issues.
- [ ] Build and test both Windows installer and portable ZIP.
- [ ] Verify the GitHub release assets and in-game update manifest use the same version.

## Trailer and store-page work

**Trailer:** In progress outside the code roadmap.

- [ ] Record a short gameplay trailer showing fortress construction, cannon aiming/firing, and a battle.
- [ ] Add the trailer to the itch.io page.
- [ ] Keep the itch.io description and screenshots in sync with the current build.

## Later ideas — not committed to 1.1.0

These are possible future directions. We'll prioritize them after the core game is stable and after hearing from players.

- More weapon types and defensive structures.
- Additional building materials and meaningful material trade-offs.
- More AI strategies and difficulty tuning.
- More maps, arenas, or match variations.
- More sound, effects, and destruction polish.
- Save/load or other quality-of-life features, if they fit the game's design.

## How to use this roadmap

Work from the highest-priority unfinished section first. When a bug is found, record the steps to reproduce it, the expected result, and what actually happened. Move an item to complete only after it has been tested in the game. Update this document as priorities change.

# MINEFALL Character Skin Art Specification — v1

This document defines the only supported first-pass character sprite format. Use the same spec for Gemini, Midjourney plus cleanup, or a human artist. Do not mix dimensions, camera angle, or file naming between skins.

## Required export contract

- **File format:** PNG, RGB/RGBA; alpha transparency required. No JPG, no animated GIF, no sprite sheet.
- **Canvas:** exactly **512 × 512 px**.
- **Background:** fully transparent (alpha = 0 away from the character). No opaque background, scene, card, frame, floor tile, text, watermark, UI, or border.
- **Subject:** exactly one full character, centered. Entire silhouette must fit inside the canvas.
- **Safe area:** character silhouette occupies about **72–84% of canvas height** and **68–82% of canvas width**. Keep the outermost 8–10% transparent. Do not crop helmet, ears, hands, backpack, weapon, feet, or accessories.
- **Camera:** stylized **three-quarter top-down view**, consistent with a small board-game character seen from above. Face/visor aims slightly toward the top edge of the image. The top of the head and shoulders should be visible; avoid a flat front-facing portrait or a strict side view.
- **Art style:** polished, readable 3D game-icon render with a clean silhouette, controlled highlights, soft short contact shadow only if it stays inside the alpha silhouette, and enough contrast to be legible when drawn at roughly 20–34 px on the board.
- **Lighting:** consistent soft key light from upper-left; do not bake a colored circular floor/background underneath the feet.
- **Detail budget:** large, distinct materials and shapes; avoid tiny text, thin wires, fine surface noise, or details that disappear at 24 px.
- **Consistency:** all skins in one batch must have the same camera, scale, framing, lighting direction, render finish, and visual sharpness. Only the character concept changes.

## Exact file names and where they go

Put output PNGs in `assets/skins/`. The filename must match the catalog ID exactly:

| Catalog ID | Required file | First-batch silhouette idea |
|---|---|---|
| `skin-classic` | `assets/skins/skin-classic.png` | Compact explorer with rounded helmet, visor and small backpack |
| `skin-gold` | `assets/skins/skin-gold.png` | Small armored treasure knight with a distinct crown-shaped helmet |
| `skin-violet` | `assets/skins/skin-violet.png` | Floating crystal/arcane scout with a pointed hood and crystal shoulder shapes |
| `skin-crimson` | `assets/skins/skin-crimson.png` | Chunky red rescue mech with broad shoulders and a squared helmet |
| `skin-mint` | `assets/skins/skin-mint.png` | Leaf-and-stone golem with leaf crest, rounded stone torso and short limbs |

These names preserve the existing store IDs and owned loadouts. Replacing an image with a new file is enough for the current five IDs; no code changes are needed. If you add a **new** skin ID, also add the item to `cosmetics.js` (with a unique `skin-...` ID, title, emoji fallback, price, color, and ownership defaults) before generating the corresponding PNG. The server already whitelists PNG files by catalog skin ID.

## Gemini prompt template (copy/paste)

> Create one production-ready MINEFALL character skin sprite for a polished multiplayer Minesweeper game. Output exactly one **512 × 512 PNG with a genuinely transparent alpha background**. Show one complete, centered, stylized 3D character in a consistent three-quarter top-down camera angle as seen from above on a game board, facing slightly toward the top edge. The character should have a bold, distinctive silhouette readable when displayed at only 24–34 pixels. Keep the whole silhouette inside 72–84% of canvas height with at least 8–10% transparent margin; do not crop any part. Consistent soft lighting from the upper-left, crisp material separation, high-quality game asset finish. No floor, tile, scene, circle base, backdrop, card, typography, text, logo, watermark, UI, border, collage, multiple views, sprite sheet, or extra characters. Preserve transparency everywhere outside the silhouette. Concept: **[INSERT SKIN CONCEPT]**. Match the same scale, angle, framing, and lighting as the other MINEFALL skin assets.

## Acceptance checklist before importing

- [ ] Image properties report 512 × 512 px and PNG.
- [ ] Background alpha is transparent, not checkerboard pixels or a fake solid-color background.
- [ ] One whole character only; no cropped accessories and no extra props floating away from it.
- [ ] View is top-down three-quarter, not front portrait or profile.
- [ ] The silhouette remains clear at 24 px.
- [ ] Filename exactly matches the existing skin ID.
- [ ] Test the image in `assets/skins/` and refresh the browser. If it does not load, the game falls back to its CSS pawn, so check browser network for a missing `/assets/skins/<id>.png` request.

## Why this works in a game

Generated art is just a texture asset; the game loads it using the skin ID and displays it on the existing pawn position/movement system. It does not alter movement, collision, mine rules, or network authority. Keep files as static PNGs for this first release; animated character models or 3D meshes would require a different asset pipeline.

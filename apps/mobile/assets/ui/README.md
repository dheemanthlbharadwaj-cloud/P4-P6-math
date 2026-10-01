# UI art the product owner supplies

Replace any file below with real art **using the same file name** (PNG with transparency unless noted).
All of them are referenced from exactly one place: `apps/mobile/src/theme/assets.ts`. The current files are
generated placeholders (`node scripts/gen-placeholders.mjs`); keep the same aspect ratio or adjust the `style`
sizes in the components that render them (`NodeButton`, `LevelButton`, `TabIcon`, ...).

| File | Used for | Recommended size |
|---|---|---|
| `map-bg-1.png`, `map-bg-2.png`, `map-bg-3.png` | Map backgrounds, cycled by topic order (add more files + entries in assets.ts for per-topic art) | 1080x1920 (portrait), no text |
| `node-default.png` | Subtopic node button (open) | 256x256 |
| `node-current.png` | Node the student should play next | 256x256 |
| `node-gold.png` | Node whose 3 levels are all complete | 256x256 |
| `node-locked.png` | Node inside a locked topic | 256x256 |
| `level-1.png`, `level-2.png`, `level-3.png` | Level selector buttons | 192x192 |
| `level-gold.png` | Completed level (gold button) | 192x192 |
| `tab-map.png`, `tab-book.png`, `tab-cat.png`, `tab-trophy.png`, `tab-person.png` | Bottom toolbar, in this order | 128x128, single-colour dark art (shown at 50% opacity when inactive) |
| `icon-heart.png`, `icon-energy.png`, `icon-star.png`, `icon-timer.png` | Top bar / store status icons | 96x96 |
| `lock.png` | Lock on faded (locked) topics | 192x192 |
| `cloud.png` | Cloud overlay on locked topics (tiled across the lower map) | 512x256 |
| `hat-cap.png`, `hat-crown.png`, `hat-wizard.png`, `hat-grad.png` | Hats (id = `hat-*` in the store catalogue); drawn on top of the cat's head | 256x256, hat centred horizontally, brim near the bottom edge |

Not here: cat art lives in `assets/cats/` (artist). The running-cat GIF for the daily leaderboard is still pending;
drop it in and update `catPoses`/`LeaderboardTrack` in `src/theme/cats.ts` / `src/components/RunningTrack.tsx`.
App icon / splash: add `app-icon.png` (1024x1024) and `splash.png` here and uncomment `icon` in `app.config.ts`.

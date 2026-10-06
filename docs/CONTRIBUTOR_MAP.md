# Contributor Map

This map helps contributors find the smallest part of Velora relevant to a change.

Velora targets GNOME Shell 50. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing Shell ownership or rendering behavior.

## Start by area

| Area | Main files | Typical contributions | Risk |
| --- | --- | --- | --- |
| Extension lifecycle | `gnome-shell/velora@wonderer.tech/extension.js`, `runtime.js` | enable/disable lifecycle, bootstrap, cleanup | High |
| Orb launcher | `orbThemeRuntime.js`, `orbGlass.js`, `geometry.js`, `apps.js` | launcher behavior, geometry, paging, app sources | Medium–High |
| Spotlight | `spotlightSearch.js`, `spotlightGlass.js`, `searchSurface.js` | search UX, keyboard behavior, visual integration | Medium |
| Popup surfaces | `popupGlass.js` | Quick Settings, Calendar, panel/status PopupMenu integration | High |
| Notifications | `notificationGlass.js` | notification material integration | High |
| Generic Shell cards | `shellCards.js` | Alt-Tab, workspace switcher, screenshot panel and similar Shell cards | High |
| App Grid / Overview | `appGridBackdrop.js`, `overviewSearchGlass.js`, `overviewCloseGlass.js` | Overview/App Grid visuals and transitions | Medium–High |
| Adaptive text | `sharedAdaptiveText.js` | contrast/readability logic | Medium |
| Shared material | `glassMaterialSystem.js` | shared glass parameters and material plumbing | High |
| Preferences | `prefs.js`, schemas | settings UI and preference wiring | Medium |
| Runtime styling | `runtime.css` | Shell styling that does not replace native geometry | Medium |
| Vendored renderer | `vendor/liquid-glass/` | renderer internals, shader/blur pipeline | Very High |
| Installer | `gnome-shell/install.sh` | install/update reliability | Medium |
| Docs / screenshots | `README.md`, `docs/` | docs, QA guides, compatibility evidence | Low |

## Contribution lanes

### Good first contribution

Best places to begin:

- docs and compatibility testing;
- reproducible bug reports;
- keyboard/accessibility QA;
- small CSS/readability fixes;
- isolated preference text or validation;
- regression checklists.

### Intermediate

Good after reading the architecture:

- Orb geometry/paging fixes;
- Spotlight UX fixes;
- adaptive text behavior;
- installer robustness;
- isolated App Grid/Overview fixes.

### Advanced

Coordinate in an issue/discussion before starting:

- PopupMenu ownership;
- enable/disable lifecycle;
- generic Shell card integration;
- shared material system;
- renderer or shader changes;
- anything that changes native GNOME actor ownership.

## How to claim work

To reduce duplicate work:

1. Comment on the issue with a short implementation plan.
2. Say that you would like to work on it.
3. For a `good first issue`, include your GNOME Shell version if testing is involved.
4. If someone is already actively working on the issue, coordinate before starting a competing implementation.
5. If there is no activity for a while, another contributor may pick it up.

No issue is permanently reserved. The goal is coordination, not gatekeeping.

## Before opening a PR

Check the relevant ownership rule:

- Is GNOME still responsible for layout and interaction?
- Does disable/re-enable restore native state?
- Did the change add a timer, polling loop, capture path or new actor lifecycle?
- Is the change scoped to the component you intended?
- Can another contributor reproduce your test?

For a general workflow, see [DEVELOPMENT.md](DEVELOPMENT.md) and the repository [CONTRIBUTING.md](../CONTRIBUTING.md).

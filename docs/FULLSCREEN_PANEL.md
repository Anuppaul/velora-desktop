# Fullscreen top bar and panel visibility (GNOME Shell 50)

## Why the top bar could stay visible

GNOME Shell 50 already registers `Main.layoutManager.panelBox` with
`trackFullscreen: true`. When a fullscreen window is on the **primary
monitor**, the Shell normally hides that actor. Velora uses a separate
`DashManager.bgActor` glass layer inserted into `uiGroup`, outside the
native panelBox; it can remain visible when the native panel has hidden.

The problem may become more apparent when software brightness below 100%
inhibits fullscreen direct scanout: Mutter must composite the whole scene
rather than sending the video buffer directly to the display.

## Implementation

- GNOME's native `in-fullscreen-changed` event drives a small visibility
  guard. It checks `get_monitor_in_fullscreen(primaryIndex)`, then only
  hides `panelBox` if the Shell has not already done so.
- A `DashManager.setVisibilityGate()` callback suppresses the **Velora
  top-panel glass** whenever the native panel is hidden/unmapped or its
  primary monitor is fullscreen.
- The guard synchronizes on `panelBox notify::visible` and
  `Main.panel notify::mapped` without polling; on a fullscreen transition
  it requests a single redraw of the `uiGroup` compositor brightness scene.
- On leaving fullscreen, visibility is handed back to GNOME's native
  `LayoutManager._updateVisibility()` so Overview/session behavior is
  preserved. On disabling Velora, the guard disconnects its signals,
  clears the vendor visibility callback and never forces a panel visible
  while GNOME still considers that monitor fullscreen.
- The separate **Ubuntu Dock Panel-mode liquid backdrop** is suppressed
  on the monitor where a fullscreen window is active. This does **not**
  change Ubuntu Dock's own native autohide settings or hide animations.
- All Quick Settings brightness values, fullscreen direct-scanout inhibitor
  references and Ptyxis Terminal Glass code stay unchanged.

## GNOME 50.1 acceptance checks

1. With software brightness **60%**, open Firefox/YouTube fullscreen on
   the primary monitor. The top bar and its separate glass background should
   disappear, while brightness remains at 60%.
2. Exit fullscreen: the bar, icons and glass return to their previous
   appearance; Quick Settings still works.
3. On two displays, fullscreen a video **only on the secondary monitor**:
   the primary top bar must stay in its normal state.
4. Enter/exit fullscreen repeatedly, then update Velora via the existing
   hot-swap installer. No stale glass bar or duplicate signal handlers should
   remain.
5. At software brightness 100% and feature OFF, ordinary GNOME fullscreen
   panel visibility should still be native.

**Important:** In Ubuntu Dock's extended **Panel mode**, the dock itself is
owned by the separate `ubuntu-dock@ubuntu.com` extension. If native Dock
icons remain in fullscreen, check Velora Preferences → Dock → Native Ubuntu
Dock — Visibility & Auto-hide: **Always visible** should be OFF, and enable
**Intelligent hide** or **Auto-hide at screen edge**. **Allow reveal in
fullscreen** controls native edge reveal. Velora does not silently rewrite
these user choices when hiding only its independent glass layer.

Code is integration-tested with GNOME 50 scene mocks; actual Wayland
compositor screenshots still need device verification. Neither passing
static checks nor native fullscreen detection guarantees pixel-perfect
visual output on every Ubuntu Dock version.

## References

- GNOME Shell 50 `js/ui/layout.js`: `panelBox`, `trackFullscreen`,
  `_updateActorVisibility`, `in-fullscreen-changed`.
- GNOME Shell 50 `js/ui/osdWindow.js`:
  balanced fullscreen compositor direct-scanout inhibition.
- Velora `liquidGlassDock.js` and bundled upstream
  `dist/dockManager.js`: independent top-panel glass actor.

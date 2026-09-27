# Velora architecture

## Runtime layers

### LauncherActivity
Owns the Android HOME window and immersive system-bar behavior.

### LauncherViewModel
Owns installed app state, freeform Home items, icon scale, pinning, movement and drag-to-group logic.

### LayoutStore
Persists the Home layout and visual preferences locally with SharedPreferences and compact JSON. No network is required.

### AppCatalog
Discovers launchable apps, launches packages and maintains a small in-memory icon cache.

### Compose UI
HomeCanvas, AppDrawer, ControlCenter, group overlay, edit sheet, settings panel and the custom navigation surface.

### Optional system-assist services
VeloraNotificationListener mirrors active notifications into the in-launcher Control Center after explicit user permission.

VeloraAccessibilityService exposes only global Back, Home and Recents actions for the custom navigation surface after explicit user enablement.

## Freeform coordinate model

Home positions are normalized:

- x = 0.0 to 1.0
- y = 0.0 to 1.0

Rendering converts those normalized values into pixel offsets for the current canvas. This prevents a layout from being tied to one phone resolution.

## Grouping model

A Home item is either APP or GROUP.

When an APP finishes a drag, the state layer checks nearby Home items. If the final normalized distance is below the grouping threshold:

- APP + APP creates a GROUP
- APP + GROUP appends the package to the GROUP

This is intentionally spatial and requires no folder edit mode.

## Performance constraints

- No continuously running blur engine
- Small LRU app-icon cache
- No background network polling
- No analytics SDK
- Notification service only when Android binds it
- Accessibility service only when the user explicitly enables it
- JSON layout is sufficient until the data model genuinely requires Room

## SystemUI boundary

While LauncherActivity is visible, Velora uses immersive mode and draws its own status/navigation surfaces.

Outside the launcher window, Android still owns the real SystemUI. Whole-device visual replacement is a different technical layer and must not be mixed into the base launcher.

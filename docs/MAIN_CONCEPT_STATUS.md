# Velora main concept status

Last updated: 2026-09-27

## Main product concept

Velora is a lightweight premium Android launcher built around a freeform spatial Home canvas and a coherent glass-first interface.

The current implementation covers the main concept requested for the first device build.

## Implemented

### Freeform Home
- No mandatory Home grid
- Normalized X/Y positions
- Icons can overlap
- Dragged items automatically come to the front
- Position, scale and z-order persist
- Per-icon size control
- Global icon-size control
- Optional Home labels
- Haptic feedback on spatial interaction

### Premium icon system
- Velora Glass
- Velora Aurora
- Original icon mode
- Squircle, Circle and Soft Square shapes
- Deterministic per-app accents
- Shared rendering across Home, Apps and groups

### App groups
- Drag app onto app to create a group
- Drag app onto an existing group to add it
- Rename groups
- Resize groups
- Ungroup
- Persistent spatial position and z-order

### Premium native widgets
- Glass Clock
- Today / Calendar
- Battery
- Device storage + memory
- Freeform positioning
- Resize
- Remove
- Persistent z-order
- Widget picker

### Wallpaper-aware glass
- Reads Android wallpaper colors where supported
- Derives Velora accent and secondary colors locally
- Glass panels use lightweight gradient, highlight and specular treatment
- No permanent blur engine or wallpaper upload

### Apps surface
- Installed app discovery
- Search
- Long-press to pin to Home
- Hidden-app manager
- Hidden apps are removed from Home and Apps

### Velora Control Center
- Swipe down from Home
- Grouped notifications
- Open notification
- Dismiss individual notification
- Clear all notifications
- Active media session
- Play / pause
- Previous / next
- Brightness control with Android special-access fallback
- Media volume control
- Wi-Fi, Bluetooth, Sound and Android Settings shortcuts

### Navigation surface
- Left: Recents glyph
- Center: Velora Orb / Home
- Right: Back
- Long-press Velora Orb: Velora Settings
- Optional Accessibility service supplies Android global Back and Recents
- Velora hides stock system bars while the launcher window is active

### Setup and settings
- First-run setup
- Default Home shortcut
- Notification access shortcut
- Accessibility integration shortcut
- Wallpaper chooser shortcut
- Glass-first settings UI
- Layout backup to JSON
- Layout restore from JSON

### Lightweight constraints
- No ads
- No analytics
- No account
- No Firebase
- No cloud requirement
- No always-on network polling
- Small in-memory icon cache
- Platform APIs preferred over large libraries

### Build flow
- GitHub ZIP
- Upload ZIP to Google Colab
- JDK 17
- Android SDK 35
- Gradle build
- Velora-debug.apk download

## Android platform boundary

A normal launcher APK cannot replace Android SystemUI across every third-party app.

Velora fully controls:
- its Home window
- Home status treatment
- app drawer
- groups
- widgets
- launcher settings
- Control Center shown from Velora
- custom navigation surface shown in Velora

Android still owns the actual system notification shade, lock screen and navigation/status SystemUI outside the Velora window unless a separate rooted/custom-ROM/SystemUI layer is used.

This boundary is intentional in the standard build because Velora is meant to remain lightweight and reversible.

## Before calling the first APK stable

The main concept is implemented, but the project still needs runtime validation.

Required after the first Colab build:
1. Resolve any compiler issues exposed by the real Android toolchain.
2. Install on the target phone.
3. Validate launcher selection and Home resume behavior.
4. Validate drag, overlap and grouping on the target display.
5. Validate notification listener and media session behavior.
6. Validate Accessibility global actions.
7. Validate brightness special access.
8. Check RAM, battery and frame pacing.
9. Fix OEM-specific behavior if the target phone customizes Android aggressively.
10. Produce a signed release APK after the debug build is stable.

Feature-complete and build-verified are intentionally treated as separate milestones.

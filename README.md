# Velora Launcher

Velora is a lightweight premium Android launcher built around a freeform spatial Home canvas, wallpaper-aware glass surfaces, dynamic premium icons, native widgets and a custom Control Center.

## Core identity

- No mandatory Home grid
- Freeform icon, group and widget positioning
- Per-item and global sizing
- Persistent overlap / z-order
- Velora Glass and Aurora icon treatments
- Drag-to-group with rename and ungroup
- Premium native Clock, Today, Battery and Device widgets
- Wallpaper-derived glass accents
- Searchable Apps surface and hidden apps
- Swipe-down Velora Control Center
- Grouped notifications and media controls
- Brightness and volume controls
- Custom Recents / Velora Orb / Back navigation surface
- First-run system integration setup
- JSON layout backup and restore
- Offline-first and lightweight architecture

## Build

The primary build path is intentionally simple:

1. Download this repository as a ZIP.
2. Open `colab/build_velora.ipynb` in Google Colab.
3. Run the notebook.
4. Upload the repository ZIP.
5. Download `Velora-debug.apk`.

See `docs/COLAB_BUILD.md`.

## Current milestone

Velora has passed an earlier full debug APK build. Current source has moved beyond that build with Android app-widget hosting, hardened Home/App actions, split Notifications/Control Center, and release tooling. The current source still requires one consolidated build and physical-device/OEM validation before release.

See `docs/MAIN_CONCEPT_STATUS.md` for the exact implementation checklist and Android platform boundaries.

## Stack

- Kotlin
- Jetpack Compose
- Android platform APIs
- Gradle Kotlin DSL
- Local persistence
- Android SDK 35

Velora intentionally has no ads, analytics, account requirement, Firebase dependency or always-on cloud service.


## Simulation Mode

Debug builds include an isolated **Velora Preview** entry for emulator and cloud testing. It uses synthetic apps, notifications and media state, so it can demonstrate the launcher without becoming the default Home app or requesting personal permissions.

The Colab notebook can automatically capture Home, Apps, Control Center, Settings and Widgets screenshots when its runtime exposes KVM.

See `docs/SIMULATION.md`.


## Home edge gestures

- Swipe down from the **top-left** edge: Velora Notifications
- Swipe down from the **top-right** edge: Velora Control Center
- Swipe up on Home: Apps


## Home edit mode

Long-press an empty area of Home to enter Edit Mode. The edit bar provides direct access to Widgets, Wallpaper, Velora Settings and Done.

## App actions

Long-press an app in Apps to open its action sheet. Real launcher builds provide Pin to Home, Hide, App info and Uninstall actions.


## Android app widgets

Velora can host standard Android widgets from installed apps. Open Home Edit Mode → Widgets → Android app widgets. Binding always follows Android's user-consent flow; providers with configuration screens are configured before being added. Hosted widgets are freeform, movable, resizable and removable.

Bound Android widget IDs are device-local. Backup exports provider/layout metadata for reference but never reuses another device's widget IDs without Android binding consent.

## Release signing

Release signing is environment-based. No keystore or password belongs in this repository.

Required environment variables:

- `VELORA_KEYSTORE`
- `VELORA_STORE_PASSWORD`
- `VELORA_KEY_ALIAS`
- `VELORA_KEY_PASSWORD`

The Colab notebook includes an optional signed-release section that can generate a signed release APK and AAB after the debug build is stable.


## Gesture-only sheet dismissal

Velora system surfaces no longer require a Close button:

- Notifications: swipe up from the bottom handle to dismiss toward the top.
- Control Center: swipe up from the bottom handle to dismiss toward the top.
- Apps: swipe down from the top handle to dismiss toward the bottom.

The sheet follows the drag, dismisses after the threshold, and springs back when the gesture is too short.


## Alpha 17 interaction repair

- GlassPanel now measures intrinsic content correctly, preventing zero-height action sheets and controls.
- Home edit sheets expose size/remove and real app info/uninstall actions.
- Native widget tap opens widget editing.
- Apps can be long-pressed and dragged from Apps to a freeform Home position.
- Full-screen Apps/Notifications/Control Center no longer rely on the global modal blackout.
- Simulation app taps open a synthetic app preview instead of behaving like a no-op.


## Alpha 18 liquid glass + wallpaper blur

- Notifications, Control Center and bottom navigation use the stronger Liquid Glass surface.
- Wallpaper blur is adjustable from 0% to 100% in Velora Settings and is persisted in backup v4.
- Android 12+ uses window-level wallpaper/background blur; older devices keep a soft translucent fallback.
- Simulation Mode previews wallpaper blur and includes a working Recents surface.
- Real Recents/Back buttons fall back to Accessibility setup when global navigation permission is not enabled.
- Home closes every Velora layer and returns to the launcher root.

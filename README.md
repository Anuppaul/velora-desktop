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

The requested first main product concept is implemented in source. The next milestone is the first real Colab compilation and target-device validation; source-complete does not mean build-verified.

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

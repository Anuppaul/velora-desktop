# Velora Launcher

Velora is a lightweight, premium Android launcher built around a freeform spatial home screen and a cohesive glass-first visual language.

The goal is not to imitate a stock Android launcher. Velora treats the home screen as a personal canvas: apps can live anywhere, individual icons can be large or small, apps can merge into groups by dragging them together, and the launcher provides its own premium control surfaces.

## Current foundation

Implemented in the first runnable slice:

- Android HOME launcher role
- Kotlin + Jetpack Compose
- Freeform icon positioning with normalized coordinates
- Per-icon resize
- Global icon-size control
- Drag one app onto another to create a glass group
- Drag an app onto a group to add it
- Searchable app drawer
- Long-press an app in the drawer to pin it to Home
- Wallpaper-backed transparent launcher window
- Glass-inspired cards, panels, dock and overlays
- Premium clock and lightweight status row
- Velora Control Center surface
- NotificationListenerService integration
- Optional AccessibilityService for Back / Home / Recents actions
- Custom bottom navigation surface: Recents / Velora Orb / Back
- Immersive launcher window that hides stock system bars while Velora is visible
- Colab ZIP-to-APK build notebook
- No analytics, account system, ads, Firebase, or always-on network dependency
- No GitHub Actions CI

## Interaction model

- Swipe up on Home: open Apps
- Swipe down on Home: open Velora Control Center
- Drag an icon: move it freely
- Drop one app near another: create a group
- Drop an app near an existing group: add it to that group
- Long-press a Home item: resize or remove it
- Long-press an app in Apps: pin it to Home
- Hold the Back-side navigation control later becomes the entry point for deeper launcher controls; Settings is also available from the in-app settings path

## Build with Google Colab

Download this repository as a ZIP, open colab/build_velora.ipynb in Google Colab, run all cells, upload the ZIP when asked, and download Velora-debug.apk at the end.

The notebook installs JDK 17, Android SDK 35, Gradle 8.9, writes local.properties, builds :app:assembleDebug, locates the APK, and downloads it.

See docs/COLAB_BUILD.md for the exact flow.

## Android boundaries

Velora can fully control its own launcher window, Home canvas, app drawer, groups, widgets, settings, control center and navigation surface.

A normal APK cannot permanently replace Android SystemUI across every third-party app. Velora therefore separates launcher-owned UI from optional system-assist services. Accessibility is opt-in and is only used for explicit global navigation actions.

## Project direction

Velora is being designed as a personal premium interface first, with four priorities:

1. visual quality
2. freedom of placement
3. low runtime overhead
4. predictable Android behavior

See docs/PRODUCT_VISION.md and docs/ARCHITECTURE.md.

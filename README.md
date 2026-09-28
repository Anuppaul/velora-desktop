# Velora

Velora's `main` branch now preserves only the **Liquid Glass / Aurora visual concept**.

The previous Android launcher implementation, Gradle project, APK/release tooling, simulation code, Android services, widgets, Control Center, notifications, launcher navigation and phone-specific product logic have been intentionally removed from `main`.

## Retained identity

Velora Liquid Glass is a platform-neutral visual system built around:

- wallpaper-aware accent colors;
- translucent layered surfaces rather than opaque cards;
- soft native background blur where the platform supports it;
- bright top-left specular highlights;
- cyan / aqua / blue / violet ambient refraction;
- thin luminous edge treatment;
- restrained depth and shadow;
- borderless full-page glass for large surfaces;
- rounded local glass surfaces for contained controls;
- a graceful low-cost fallback when real blur is unavailable;
- no visual effect that requires permanent GPU load.

The canonical reference is:

- `docs/LIQUID_GLASS_CONCEPT.md`

## Scope

This branch is **not an Android application** and is not intended to build an APK.

Future platform implementations should consume the Liquid Glass design language without restoring the removed Android launcher architecture unless that is explicitly decided later.

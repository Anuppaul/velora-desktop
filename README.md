# Velora

Velora `main` now contains two things:

1. the **GNOME 50 Velora Desktop extension** under `gnome-shell/`;
2. the retained, platform-neutral **Liquid Glass / Aurora visual concept** under `docs/LIQUID_GLASS_CONCEPT.md`.

The previous Android launcher implementation, Gradle project, APK/release tooling, simulation code, Android services, widgets, Control Center, notifications, launcher navigation and other phone-specific product logic have been removed from the current `main` tree.

## GNOME implementation

The active desktop implementation lives in:

    gnome-shell/

See:

    gnome-shell/README.md

for installation, live registration, hot-swap updates, settings and debugging.

## Retained visual identity

Velora Liquid Glass keeps the design language originally explored in the Android prototype:

- wallpaper-aware accent colors;
- layered translucent surfaces;
- native background blur where available;
- bright specular highlights;
- cyan / aqua / blue / violet refraction;
- thin luminous edges;
- restrained shadow and depth;
- borderless full-page glass;
- rounded local glass surfaces;
- low-cost fallback paths when blur is unavailable.

Canonical visual reference:

    docs/LIQUID_GLASS_CONCEPT.md

## Android status

This repository is no longer an Android launcher project and is not intended to build an APK from `main`.

Android source remains recoverable from Git history, but it is intentionally absent from the current tree.

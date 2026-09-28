# Velora engineering rules

- `main` contains the GNOME 50 Velora Desktop implementation plus the platform-neutral Liquid Glass concept.
- Do not restore the removed Android launcher, Gradle/APK tooling, Android services, phone navigation, notifications, widgets or Control Center code to `main` without an explicit product decision.
- Keep GNOME implementation work inside `gnome-shell/`.
- Preserve the Liquid Glass identity: wallpaper-aware color, layered translucency, luminous edges, restrained blur, refraction and depth.
- Preserve Orb and Liquid Glass Dock as independent launcher surfaces; either may be enabled alone or both may coexist.
- Prefer native GNOME/Clutter/St capabilities over heavyweight dependencies.
- Every expensive visual effect needs a lightweight fallback.
- Do not require continuous GPU-heavy blur or animation for the design to look correct.
- Keep the GNOME installer deterministic and do not reintroduce stale JavaScript module assumptions.
- Runtime-only Velora updates should use the bootstrap hot-swap path instead of forcing a Shell session restart.
- Bootstrap/schema changes must be fingerprinted and must not be treated as runtime-only changes.
- Do not add analytics, tracking, ads, account requirements or cloud dependencies.
- Treat readability, contrast, frame stability, battery use and accessibility as product requirements.

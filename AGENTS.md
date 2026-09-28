# Velora engineering rules

- `main` is the platform-neutral Velora Liquid Glass concept reference.
- Do not restore Android launcher code, Gradle files, APK/AAB release tooling, Android services, phone navigation, notifications, widgets or Control Center logic to `main` without an explicit product decision.
- Preserve the Liquid Glass visual identity: wallpaper-aware color, layered translucency, luminous edges, restrained blur, refraction and depth.
- Prefer native platform blur/material APIs when available.
- Every expensive visual effect must have a lightweight fallback.
- Never make continuous GPU-heavy blur or animation a requirement for the design to look correct.
- Keep implementation-specific code on platform-specific branches or directories rather than contaminating the platform-neutral concept.
- Do not add analytics, tracking, ad SDKs, account requirements or cloud dependencies to the visual system.
- Favor a small number of reusable glass primitives over many inconsistent one-off styles.
- Treat readability, contrast, battery use, frame stability and accessibility as part of the visual specification.

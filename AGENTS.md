# Velora engineering rules

- Velora is a GNOME Shell Liquid Glass material project. Do not reintroduce the removed Android launcher/product architecture.
- Preserve the existing GNOME surface design, geometry, content, input and native interaction unless a task explicitly requires otherwise.
- Apply Liquid Glass as a material treatment, not as a replacement UI and not as a second visible card behind the target.
- Roll out system-wide theming surface-by-surface. Stabilize one target before extending the material to the next.
- Prefer the shared wallpaper/background source for Shell UI when live window capture is not required.
- Prefer cached, damage-driven rendering over timers or unconditional per-frame redraw.
- Prefer Dual Kawase or downscaled Gaussian blur for low-load paths; every expensive effect needs a lightweight fallback.
- Use refraction, tint, saturation, rim/specular and shadow conservatively so readability remains native-quality.
- Preserve notification layout/content/animation while notification glass is under test.
- Keep GNOME implementation work inside `gnome-shell/`.
- Prefer native GNOME/Clutter/St capabilities over heavyweight dependencies.
- Keep the installer deterministic and preserve runtime hot-swap safety.
- Runtime-only updates should use the bootstrap hot-swap path. Bootstrap/schema changes must remain fingerprinted.
- Do not add analytics, tracking, ads, account requirements or cloud dependencies.
- Treat contrast, accessibility, frame stability, GPU cost and battery use as product requirements.

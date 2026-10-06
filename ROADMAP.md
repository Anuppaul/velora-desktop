# Roadmap

This roadmap communicates direction, not a delivery promise.

Velora prioritizes **stability, native GNOME behavior, performance and maintainability** over adding features quickly.

## Current priorities

### 1. GNOME Shell 50 stability

- expand compatibility evidence across GNOME Shell 50 environments;
- improve regression coverage for Dock, PopupMenu, notifications, Overview, Orb and Spotlight;
- strengthen enable/disable/re-enable lifecycle testing;
- reduce environment-specific assumptions.

### 2. Contributor-quality tooling

- source-tree preflight validation;
- focused unit/regression coverage for isolated logic;
- diagnostics for high-quality bug reports;
- clearer settings and lifecycle references;
- reproducible test workflows.

### 3. Accessibility

- keyboard/focus QA for Spotlight and Orb;
- reduced-animation behavior;
- adaptive text/readability validation;
- preserve native GNOME accessibility ownership.

### 4. Performance

- keep popup/surface integration event-driven;
- avoid permanent polling and CPU capture;
- reuse actors, effects and shared sources;
- measure before/after behavior for performance-sensitive changes.

### 5. Release readiness

- establish repeatable release validation;
- package cleanly for users;
- maintain security and provenance documentation;
- prepare for official GNOME Extensions distribution when the project meets current review requirements.

## Later / exploratory

Potential areas for future investigation:

- broader GNOME Shell compatibility after the GNOME 50 line is stable;
- additional native Shell surfaces where material-only integration is safe;
- better automated regression tooling;
- richer contributor documentation and community-maintained compatibility results.

These are not commitments and may change based on upstream GNOME behavior and contributor interest.

## Explicit non-goals

Velora is not intended to become:

- a replacement desktop environment;
- a duplicate Dock implementation;
- a duplicate Quick Settings or Calendar implementation;
- a GTK/libadwaita application theme pretending to be a Shell extension;
- a background service that continuously captures the desktop.

The native-GNOME ownership model remains the design constraint for roadmap decisions.

## Proposing roadmap changes

Open a GitHub Discussion describing:

- the user problem;
- why it belongs in Velora;
- native GNOME ownership impact;
- lifecycle/performance considerations;
- a possible scoped implementation.

Accepted ideas can later become issues.

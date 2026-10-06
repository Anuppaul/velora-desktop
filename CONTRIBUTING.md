# Contributing to Velora Desktop

Thanks for helping improve Velora.

Velora is a GNOME Shell 50 extension with one non-negotiable product rule:

> **Preserve native GNOME/Ubuntu behavior. Change the material, not the desktop interaction model.**

Before starting a large change, open an issue or discussion so the approach can be agreed on first.

## Good places to start

New contributors do not need to understand the full renderer.

Good first contributions include:

- documentation and installation clarity;
- GNOME Shell 50 compatibility testing;
- reproduction cases for visual or lifecycle bugs;
- manual regression coverage for Dock, Quick Settings, Calendar, notifications, panel popups, Orb and Spotlight;
- accessibility and keyboard-navigation QA;
- small performance fixes with measurable before/after evidence;
- focused bug fixes with a clear reproduction.

See the open `good first issue` and `help wanted` issues for scoped tasks.

## Development setup

Velora currently targets **GNOME Shell 50**.

Clone the repository:

```bash
git clone https://github.com/Anuppaul/velora-desktop.git
cd velora-desktop
```

Install/update the extension:

```bash
bash gnome-shell/install.sh
```

On a clean first install, follow the installer output. A normal Log Out → Log In may be required once for GNOME Shell to discover a newly installed local extension.

Open preferences:

```bash
gnome-extensions prefs velora@wonderer.tech
```

Useful Shell logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'
```

## Architecture rules

Please read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing Shell integration or rendering behavior.

Changes should preserve these rules:

1. GNOME owns layout, geometry, content, controls, hit targets, accessibility and native animation.
2. Velora owns the supported material layer underneath that content.
3. Do not create duplicate native UI when material-only integration is possible.
4. Disable/cleanup paths must restore native Shell state safely.
5. Avoid permanent polling, CPU screenshot loops and unnecessary property writes.
6. Prefer compositor-native actors/effects and shared/cached sources.
7. Keep the GNOME Shell 50 target explicit in compatibility-sensitive code.

## Making a change

1. Fork the repository.
2. Create a focused branch.
3. Keep the change small enough to review.
4. Test enable → use → disable/re-enable behavior when your change touches runtime Shell state.
5. Include relevant logs or screenshots for visual/runtime changes.
6. Update documentation when behavior or architecture changes.
7. Open a pull request using the repository PR template.

A pull request should solve one clear problem. Avoid bundling unrelated cleanup or redesigns into the same PR.

## Bug reports

A useful bug report includes:

- GNOME Shell version;
- distribution and version;
- Wayland/X11 session where relevant;
- Velora commit or revision;
- exact reproduction steps;
- expected behavior;
- actual behavior;
- relevant GNOME Shell logs;
- screenshot or screen recording when the issue is visual.

## Performance changes

Performance work should include evidence whenever practical, for example:

- before/after frame behavior;
- CPU usage;
- memory usage;
- whether a change adds polling/timers;
- whether actors/effects are reused or recreated;
- whether the change affects only an opened surface or runs continuously.

Avoid performance claims without a reproducible observation.

## Pull request review checklist

Before submitting, confirm:

- [ ] Native GNOME interaction/layout is preserved.
- [ ] The change has a focused scope.
- [ ] Enable/disable cleanup was considered.
- [ ] No unnecessary polling or CPU capture path was introduced.
- [ ] GNOME Shell 50 behavior was tested where applicable.
- [ ] Documentation was updated if behavior changed.
- [ ] Visual changes include screenshots when useful.

## Licensing and provenance

Velora is released under the MIT License, but the repository also retains required attribution/provenance for vendored or derived components.

Do not remove third-party license or provenance notices unless the underlying licensing requirements have been verified.

## Questions and ideas

Use GitHub Discussions for broad ideas and design conversations. Use Issues for reproducible bugs and scoped implementation work.

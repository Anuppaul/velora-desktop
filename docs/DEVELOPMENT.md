# Velora Development Guide

This guide is for contributors making and validating changes locally.

## Target

Velora currently targets **GNOME Shell 50**.

Check your version:

```bash
gnome-shell --version
```

## Clone

```bash
git clone https://github.com/Anuppaul/velora-desktop.git
cd velora-desktop
```

For contribution work, create a focused branch:

```bash
git switch -c fix/short-description
```

## Install or update

```bash
bash gnome-shell/install.sh
```

A clean first install can require one normal Log Out → Log In so the running GNOME Shell session discovers the new local extension.

Normal runtime revisions should use Velora's update/hot-swap path where supported.

## Verify activation

```bash
gnome-extensions list --active | grep velora@wonderer.tech
```

Open preferences:

```bash
gnome-extensions prefs velora@wonderer.tech
```

## Logs

Follow Velora-related Shell logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'
```

Useful baseline messages include:

```text
[Velora][PopupGlass] global PopupMenu adapter active
```

When reporting a runtime problem, include the smallest relevant log section rather than a full session log.

## Manual smoke test

For most runtime changes, check:

1. Enable Velora.
2. Exercise the changed surface.
3. Open another unrelated Velora surface.
4. Disable Velora.
5. Confirm native Shell UI still works.
6. Re-enable Velora.
7. Repeat the changed path.

If the change touches Dock/Orb/Spotlight, also test the relevant pointer and keyboard path.

## Visual changes

For a visual PR, include:

- before screenshot;
- after screenshot;
- GNOME Shell version;
- distribution/version;
- session (Wayland/X11);
- any preference values required to reproduce the result.

Avoid screenshots that hide clipping, edge placement or multi-monitor behavior when those areas are relevant to the change.

## Performance changes

Document whether your change:

- introduces a timer;
- introduces polling;
- creates actors repeatedly;
- creates GPU effects repeatedly;
- changes blur downscale/cache behavior;
- starts work before a surface is visible;
- reads pixels back to the CPU.

Prefer event-driven updates and reuse.

To record repeatable, read-only GNOME resource baselines, see [Performance capture](PERFORMANCE.md). This does not measure frame rates.

## Cleanup changes

When touching Shell actors, signals, timeouts, keybindings or monkey patches, verify teardown explicitly.

A change is incomplete if enable works but disable/re-enable leaves stale state.

## Scope

Keep PRs reviewable:

- one bug or feature per PR;
- avoid unrelated formatting churn;
- avoid renaming unrelated files;
- explain architecture changes;
- keep vendored renderer provenance intact.

## Where to ask questions

- Use **Issues** for a reproducible bug or scoped task.
- Use **Discussions** for architecture ideas, design proposals and contributor questions.
- Read [CONTRIBUTOR_MAP.md](CONTRIBUTOR_MAP.md) to find the relevant component.

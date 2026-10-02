# Velora README screenshots

This directory contains the generated screenshots used by the repository README.
Do not hand-crop or rename the generated PNGs; their filenames are intentionally
stable so README image links do not need to change after each UI refresh.

Generate the complete set on the GNOME 50 development desktop from the repository
root:

```bash
bash gnome-shell/tools/capture-readme.sh
```

The script deploys the current local Velora runtime, temporarily snapshots and
adjusts only the Dash-to-Dock settings needed for deterministic Dock/Panel
captures, drives Velora/GNOME UI states through the local token-gated capture
bridge, captures the primary monitor, and restores the previous Dock settings on
exit.

Generated files:

- `velora-desktop-dock.png`
- `velora-desktop-panel.png`
- `velora-orb.png`
- `velora-spotlight.png`
- `velora-spotlight-results.png`
- `velora-calendar.png`
- `velora-quick-settings.png`
- `velora-app-grid.png`

For a source tree that is already deployed in the active GNOME session, skip the
installer step with:

```bash
bash gnome-shell/tools/capture-readme.sh --skip-install
```

Optional environment overrides:

```bash
VELORA_CAPTURE_SEARCH_QUERY=settings \
VELORA_CAPTURE_SETTLE_SECONDS=1.0 \
bash gnome-shell/tools/capture-readme.sh
```

After capture, review the PNGs and commit them. The root README should reference
these stable relative paths rather than external image hosting.

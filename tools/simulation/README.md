# Velora Simulation Mode

Velora includes an isolated Simulation Activity for emulator and cloud-device testing.

It does not require Velora to be the default launcher and does not touch the real launcher layout.

## Launch manually with ADB

```bash
adb install -r Velora-debug.apk
adb shell am start -n tech.wonderer.velora/.SimulationActivity --es screen home
```

Supported screen values:

- `home`
- `drawer`
- `control`
- `settings`
- `widgets`

## Capture the full preview set

```bash
bash tools/simulation/capture_previews.sh Velora-debug.apk
```

This produces:

- `velora-home.png`
- `velora-drawer.png`
- `velora-control.png`
- `velora-settings.png`
- `velora-widgets.png`

The simulation uses synthetic apps, notifications and media state so screenshots are deterministic and do not depend on personal device data.

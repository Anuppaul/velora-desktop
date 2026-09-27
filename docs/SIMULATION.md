# Velora Simulation and Preview

Velora has an isolated Simulation Mode designed for emulator, cloud-device and screenshot testing.

## What Simulation Mode does

- Uses synthetic apps instead of personal installed-app data.
- Uses synthetic notifications and media cards.
- Does not require Velora to be the default Home app.
- Does not require notification access or Accessibility.
- Does not write into the real Velora Home layout.
- Supports the Home, Apps, Control Center, Settings and Widgets surfaces.
- Keeps freeform drag, resize, grouping and icon-style interactions available for visual testing.

## Debug APK behavior

Debug builds expose a second launcher entry named **Velora Preview**.

The normal **Velora** entry is the real launcher.

The **Velora Preview** entry opens isolated Simulation Mode.

Release builds do not expose the Preview icon.

## ADB launch

```bash
adb shell am start -n tech.wonderer.velora/.SimulationActivity --es screen home
```

Supported values:

- `home`
- `drawer`
- `control`
- `settings`
- `widgets`

## Automatic screenshots

With an Android emulator or connected device:

```bash
bash tools/simulation/capture_previews.sh Velora-debug.apk
```

The script captures all five primary preview surfaces.

## Google Colab

Use `colab/build_velora.ipynb`.

The notebook:

1. uploads the GitHub ZIP;
2. installs JDK 17 and Android SDK 35;
3. builds Velora;
4. detects whether the Colab runtime exposes KVM;
5. when KVM is available, starts a headless Android emulator;
6. installs Velora;
7. launches Simulation Mode for each preview surface;
8. captures screenshots;
9. downloads the APK and preview ZIP.

If the hosted runtime does not expose KVM, APK creation still succeeds. Use the same debug APK in an interactive cloud/browser Android emulator and open **Velora Preview**.

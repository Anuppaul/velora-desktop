# Velora Release Candidate Checklist

## Source-side gates

- Debug build compiles with Android SDK 35.
- No stale-source warning from the Colab preflight.
- Debug APK signature verification passes.
- Android app-widget host source compiles.
- Release build completes with R8/resource shrinking.

## Production signing

Create and permanently back up one production keystore outside the repository.

The release build expects:

```text
VELORA_KEYSTORE
VELORA_STORE_PASSWORD
VELORA_KEY_ALIAS
VELORA_KEY_PASSWORD
```

Never commit the keystore or passwords. Losing the production key prevents compatible future updates signed with that identity.

## Physical-device gates

Validate on the target phone:

- Default Home selection and Home resume
- App launch / Back / Recents
- Freeform drag and overlap
- Group creation and ungroup
- Native widgets
- At least two third-party Android widgets
- Widget configuration activity
- Notification access
- Notification open/dismiss/clear
- Media controls
- Brightness permission
- Accessibility navigation
- Left/right top-edge gesture isolation
- Wallpaper palette refresh
- Hidden apps
- App info/uninstall intents
- Backup export/restore
- Reboot persistence

## Performance gates

Observe:

- cold launcher start
- Home resume latency
- drag frame pacing
- Apps opening latency
- idle RAM
- 30-minute idle battery impact
- widget update behavior
- no repeated background wakeups

## RC output

After the gates pass, use the optional signed-release section in `colab/build_velora.ipynb` to produce:

- `Velora-release.apk`
- `Velora-release.aab`

Keep the debug Preview entry out of production distribution.

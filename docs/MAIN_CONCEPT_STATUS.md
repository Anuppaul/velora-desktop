# Velora main concept status

Last updated: 2026-09-27

## Code-side product scope

The requested Velora launcher concept is now implemented at source level.

### Home and spatial model
- Freeform normalized X/Y placement
- No mandatory Home grid
- Per-icon and global scale
- Persistent overlap/z-order
- Drag-to-group
- Group rename/resize/ungroup
- Hidden apps
- Home Edit Mode
- Widgets / Wallpaper / Settings edit bar
- Haptics and edit affordances

### Icon system
- Velora Glass
- Velora Aurora
- Original icon mode
- Squircle / Circle / Soft Square
- Deterministic per-app accents
- Simulation fallback glyphs

### Widgets
- Native Glass Clock
- Today / Calendar
- Battery
- Device storage/memory
- Standard Android app-widget hosting
- Android widget provider picker
- Android bind-consent flow
- Provider configuration flow
- Freeform Android widget move/resize/remove
- Device-local widget IDs are never silently restored across devices

### Apps
- Searchable app drawer
- Visible app action affordance
- Pin to Home
- Hide
- App info
- Uninstall intent

### Notifications and controls
- Top-left swipe-down: dedicated Notifications
- Top-right swipe-down: dedicated Control Center
- Notification grouping, open, dismiss, clear all
- Wi-Fi / Bluetooth / Focus / Display system surfaces
- Brightness and media volume
- Active media play/pause/previous/next
- OEM-safe system-settings fallback

### Navigation
- Recents / Velora Orb / Back glass navigation
- Optional Accessibility global navigation
- Velora Orb long-press provides a reliable Home Edit Mode entry
- Immersive launcher window

### Visual system
- Wallpaper-derived palette
- Live wallpaper-change palette refresh
- Glass panels with lightweight highlights/specular treatment
- Modal backdrop isolation
- Lightweight approach instead of permanent GPU-heavy backdrop blur

### Persistence and privacy
- Local-only layout persistence
- JSON backup/restore
- Hosted-widget provider metadata exported for reference
- Android cloud backup disabled
- Cleartext traffic disabled
- No ads
- No analytics
- No account
- No Firebase runtime dependency
- No always-on network service

### Build / release tooling
- Colab debug APK build
- Source-version / stale-ZIP preflight
- APK SHA-256
- APK signature verification
- Simulation Mode
- Optional signed release APK + AAB build
- Release signing credentials supplied only through environment/runtime
- Keystores ignored by git

## What cannot be completed purely in source

These are validation/deployment milestones, not missing launcher features:

1. Consolidated compilation of the latest source revision.
2. Physical-device validation of launcher/Home behavior.
3. OEM-specific fixes if a phone vendor changes SystemUI, task handling, or background rules.
4. Performance/battery/frame-time measurements on target hardware.
5. Production signing with the owner's long-term keystore.
6. Final RC visual tuning based on the target phone.

A normal APK still cannot replace Android SystemUI globally across third-party apps without root/custom-ROM/SystemUI modification.

# Velora Launcher

Velora is a lightweight premium Android launcher built around a freeform spatial Home canvas, wallpaper-aware glass surfaces, dynamic premium icons, native widgets and a custom Control Center.

## Core identity

- No mandatory Home grid
- Freeform icon, group and widget positioning
- Per-item and global sizing
- Persistent overlap / z-order
- Velora Glass and Aurora icon treatments
- Drag-to-group with rename and ungroup
- Premium native Clock, Today, Battery and Device widgets
- Wallpaper-derived glass accents
- Searchable Apps surface and hidden apps
- Swipe-down Velora Control Center
- Grouped notifications and media controls
- Brightness and volume controls
- Custom Recents / Velora Orb / Back navigation surface
- First-run system integration setup
- JSON layout backup and restore
- Offline-first and lightweight architecture

## Build

The primary build path is intentionally simple:

1. Download this repository as a ZIP.
2. Open `colab/build_velora.ipynb` in Google Colab.
3. Run the notebook.
4. Upload the repository ZIP.
5. Download `Velora-debug.apk`.

See `docs/COLAB_BUILD.md`.

## Current milestone

Velora has passed an earlier full debug APK build. Current source has moved beyond that build with Android app-widget hosting, hardened Home/App actions, split Notifications/Control Center, and release tooling. The current source still requires one consolidated build and physical-device/OEM validation before release.

See `docs/MAIN_CONCEPT_STATUS.md` for the exact implementation checklist and Android platform boundaries.

## Stack

- Kotlin
- Jetpack Compose
- Android platform APIs
- Gradle Kotlin DSL
- Local persistence
- Android SDK 35

Velora intentionally has no ads, analytics, account requirement, Firebase dependency or always-on cloud service.


## Simulation Mode

Debug builds include an isolated **Velora Preview** entry for emulator and cloud testing. It uses synthetic apps, notifications and media state, so it can demonstrate the launcher without becoming the default Home app or requesting personal permissions.

The Colab notebook can automatically capture Home, Apps, Control Center, Settings and Widgets screenshots when its runtime exposes KVM.

See `docs/SIMULATION.md`.


## Home edge gestures

- Swipe down from the **top-left** edge: Velora Notifications
- Swipe down from the **top-right** edge: Velora Control Center
- Swipe up on Home: Apps


## Home edit mode

Long-press an empty area of Home to enter Edit Mode. The edit bar provides direct access to Widgets, Wallpaper, Velora Settings and Done.

## App actions

Long-press an app in Apps to open its action sheet. Real launcher builds provide Pin to Home, Hide, App info and Uninstall actions.


## Android app widgets

Velora can host standard Android widgets from installed apps. Open Home Edit Mode → Widgets → Android app widgets. Binding always follows Android's user-consent flow; providers with configuration screens are configured before being added. Hosted widgets are freeform, movable, resizable and removable.

Bound Android widget IDs are device-local. Backup exports provider/layout metadata for reference but never reuses another device's widget IDs without Android binding consent.

## Release signing

Release signing is environment-based. No keystore or password belongs in this repository.

Required environment variables:

- `VELORA_KEYSTORE`
- `VELORA_STORE_PASSWORD`
- `VELORA_KEY_ALIAS`
- `VELORA_KEY_PASSWORD`

The Colab notebook includes an optional signed-release section that can generate a signed release APK and AAB after the debug build is stable.


## Gesture-only sheet dismissal

Velora system surfaces no longer require a Close button:

- Notifications: swipe up from the bottom handle to dismiss toward the top.
- Control Center: swipe up from the bottom handle to dismiss toward the top.
- Apps: swipe down from the top handle to dismiss toward the bottom.

The sheet follows the drag, dismisses after the threshold, and springs back when the gesture is too short.


## Alpha 17 interaction repair

- GlassPanel now measures intrinsic content correctly, preventing zero-height action sheets and controls.
- Home edit sheets expose size/remove and real app info/uninstall actions.
- Native widget tap opens widget editing.
- Apps can be long-pressed and dragged from Apps to a freeform Home position.
- Full-screen Apps/Notifications/Control Center no longer rely on the global modal blackout.
- Simulation app taps open a synthetic app preview instead of behaving like a no-op.


## Alpha 18 liquid glass + wallpaper blur

- Notifications, Control Center and bottom navigation use the stronger Liquid Glass surface.
- Wallpaper blur is adjustable from 0% to 100% in Velora Settings and is persisted in backup v4.
- Android 12+ uses window-level wallpaper/background blur; older devices keep a soft translucent fallback.
- Simulation Mode previews wallpaper blur and includes a working Recents surface.
- Real Recents/Back buttons fall back to Accessibility setup when global navigation permission is not enabled.
- Home closes every Velora layer and returns to the launcher root.


## Alpha 19 vivid wallpaper + real sheet backdrop blur

- Simulation Preview now starts with a vivid cyan / aqua / blue / violet Aurora wallpaper inspired by modern Control Center references.
- Notifications and Control Center blur the entire underlying Home layer while open, so icons/widgets/wallpaper are actually softened behind the glass.
- Liquid Glass material is lighter and more translucent, with stronger white edge sheen and cyan/violet refraction instead of near-black cards.
- The existing Wallpaper Blur slider also controls sheet backdrop intensity.


## Alpha 20 liquid-glass Apps drawer

- Apps now uses the same Liquid Glass outer sheet as Notifications and Control Center.
- Opening Apps blurs the underlying Home/wallpaper using the same adjustable Wallpaper Blur setting.
- Search is an inset Liquid Glass field rather than an outlined Material text box.
- The app grid sits inside its own Liquid Glass surface with a compact All Apps header/count.
- App action sheets also use Liquid Glass while preserving Pin, Hide, App info and Uninstall.
- Existing long-press drag-to-Home behavior remains intact.


## Beta 01 phone-test release flow

- Control Center now exposes a fuller native/system set: Internet, Wi-Fi, Bluetooth, Mobile, Airplane, Focus/DND, Display/Rotation, Battery Saver, Hotspot/Tethering, Location, VPN, Cast, Sound, NFC, Accessibility and Settings.
- Android-restricted controls open the corresponding native system panel/settings instead of pretending to toggle privileged system state.
- Brightness, media volume and active media controls remain directly integrated where Android permits.
- Colab signed-release build is password-only: no JKS upload.
- First signed build creates `/MyDrive/VeloraSigning/velora-release.jks`; future builds reuse it automatically after the same password is entered.
- Signed `Velora-release.apk`, `Velora-release.aab` and APK SHA-256 are downloaded automatically.


## Beta 02 simple phone-test release

- Google Drive signing is removed.
- No JKS upload is required.
- Colab asks only for a release password, creates a temporary JKS inside the runtime, builds and verifies Velora-release.apk, then downloads it.
- A fresh Colab runtime creates a new signature. Uninstall any older Velora build before installing a newly generated release APK.
- This flow is intended for direct phone testing, not long-term Play Store/update signing.


## Beta 03 POCO / OEM install compatibility

The uploaded beta01 APK was structurally intact and its APK Signature Scheme v2 signature/content digest verified correctly, but it was v2-only. Phone-test releases now use a conservative compatibility profile:

- RSA 2048 temporary signing key.
- APK Signature Scheme v1 + v2 + v3 explicitly enabled; v4 disabled.
- Release minification and resource shrinking disabled for phone-test builds.
- Legacy JNI packaging enabled so native libraries are extracted by the device installer.
- Colab is release-only: repository ZIP + password -> verified Velora-release.apk.


## Beta 04 sideload-safe release

Play Protect blocking was traced to special-access capabilities in the sideloaded release manifest, not APK corruption. The phone-test release now removes sensitive special-access declarations:

- No NotificationListenerService in release.
- No AccessibilityService in release.
- No WRITE_SETTINGS permission in release.
- Debug/dev builds retain those integrations for development.
- Release brightness uses local window brightness instead of WRITE_SETTINGS.
- Notification reading, cross-app media-session access and global Recents/Accessibility navigation are intentionally disabled in the sideload-safe APK.
- The release manifest therefore no longer advertises the sensitive services that caused the Play Protect financial-fraud warning.


## Beta 05 Home UX + performance pass

- Home now has three swipeable pages with page dots.
- Home page transitions are configurable: Jelly, Smooth, Fade or Off; Jelly softness is adjustable.
- App/icon dragging uses placement-only pixel deltas to avoid recomposing the full item on every drag frame.
- Premium widgets and hosted Android widgets use the same lower-overhead drag path.
- Long-press a Home icon (or tap it in Home Edit Mode) to open floating inline tools above/below that icon.
- Floating tools provide Remove, size slider, App info, Uninstall, or Ungroup as applicable; tapping outside dismisses them while icon dragging remains available.
- Apps opens directly to a six-column All Apps grid: search and the nested double-border surface are removed.
- Control Center uses a softer glass intensity; Internet/Wi-Fi/Bluetooth/Mobile are compact in one row with Brightness and Volume directly underneath.
- Home has a launcher-owned Recents surface that tracks apps opened from Velora.
- Velora now draws its own top status surface (time/network/battery) while Android system bars remain hidden in the launcher.
- Recents/Home/Back nav icons can be replaced from Settings with local PNG or SVG files and reset to defaults.
- Home item/widget page assignments, transitions, softness and custom nav icon URIs are persisted and included in backup format v5.


## Beta 06 build diagnostics

- Colab release Gradle output now streams live instead of ending with only Python CalledProcessError.
- On a Gradle failure, the notebook prints the final 220 compiler lines and writes/downloads `Velora-gradle-failure.txt`.
- Source preflight now requires versionCode 27 so stale beta05 ZIPs cannot be confused with this diagnostic build.


## Beta 07 permission and distribution architecture

Velora now separates distribution capabilities instead of putting every special access in one APK.

- `sideloadRelease`: phone-test safe. No NotificationListenerService, AccessibilityService or WRITE_SETTINGS.
- `playRelease`: adds NotificationListenerService only, for the user-facing Velora Notification Center/media feature.
- Debug builds retain the development-only Accessibility global navigation and WRITE_SETTINGS integration.
- First-run setup is now a contextual wizard: Home role -> optional Notification Access -> dev-only Accessibility -> wallpaper -> finish.
- Notification disclosure states what Velora reads and why before opening Android's native Notification Access screen.
- Accessibility disclosure appears only in development builds and explains that Velora uses it only for global navigation actions.
- Settings and Control Center now use granular build capability flags instead of one broad sensitive-integration switch.
- Colab defaults to `sideloadRelease`. Set `BUILD_CHANNEL = 'play'` only when intentionally building the Play distribution.


## Beta 08 borderless full-page glass surfaces

- Notifications no longer sit inside a rounded outer glass card.
- Control Center no longer sits inside a rounded outer glass card.
- All Apps no longer sits inside a rounded outer glass card.
- All three use one borderless edge-to-edge FullPageLiquidGlass layer while the underlying Home remains blurred.
- Inner notification/control/action cards keep their local rounded glass treatment.
- Colab preflight prints NOTEBOOK BUILD: beta08-fullpage and requires versionCode 29.


## Beta 09 Kotlin JVM setter-clash fix

- Renamed `LauncherViewModel.setHomeTransitionMode(...)` to `updateHomeTransitionMode(...)`.
- Renamed `LauncherViewModel.setTransitionSoftness(...)` to `updateTransitionSoftness(...)`.
- This removes the JVM signature clashes with the generated setters for the `homeTransitionMode` and `transitionSoftness` properties.
- Colab preflight now rejects stale source trees that still contain the conflicting method names.
- Colab identifies this source as `beta09-jvmfix` and requires versionCode 30.


## Beta 10 signing verification fix

- Velora minSdk is 26, so every supported device supports APK Signature Scheme v2.
- Phone-test signing now explicitly uses v2 + v3; legacy v1/JAR signing is not required.
- Colab verifies the APK with apksigner using minSdk 26 and requires v2=true and v3=true.
- A v1=false result no longer causes a false build failure after a successful Gradle assemble.
- Colab identifies this source as `beta10-signingfix` and requires versionCode 31.


## Beta 11 verification false-failure fix

- Removed brittle parsing that required a literal `v1=true` line after a successful APK build.
- Colab now treats `apksigner verify --min-sdk-version 26` exit code 0 as authoritative.
- v1/v2/v3 lines remain visible for diagnostics only and no longer create a false failure after a valid build.
- Colab identifies this source as `beta11-verifyfix` and requires versionCode 32.


## Beta 12 gesture, scrolling and adaptive Home repair

- Fixed the Home gesture arbitration bug that prevented swipe-up Apps, top-left Notifications, top-right Control Center and left/right Home-page swipes.
- Swipe-dismiss now belongs only to the visible handle, so LazyColumn/LazyVerticalGrid content can scroll without fighting the dismiss gesture.
- Clock and Battery premium widgets are now clean transparent widgets with no glass/palette background.
- Velora records only launches made through Velora itself; no Android Usage Access permission is requested.
- Home app icons adapt by local launch frequency: frequently used apps become larger, rarely used apps become smaller, and each page reorders into stable freeform slots.
- Usage adaptation preserves each app's assigned Home page.
- Fresh installs seed up to 18 apps across all three Home pages so page swiping is immediately visible.
- Colab identifies this source as `beta12-gesture-adaptive` and requires versionCode 33.


## Beta 13 personal notification build + persistent Recents

- Added `personalRelease` for ADB/private phone testing. It declares NotificationListenerService so Android can show and grant Velora Notification Access.
- `personalRelease` still excludes AccessibilityService and WRITE_SETTINGS.
- `sideloadRelease` remains the safest no-special-access APK; `playRelease` remains notification-enabled for Play distribution.
- Colab now defaults to `BUILD_CHANNEL = 'personal'` for the physical-phone test workflow.
- Recents are persisted locally across launcher/app restarts.
- When launch history is empty, Recents falls back to Velora's locally ranked/frequent app list instead of showing an empty panel.
- Recents now uses the same borderless full-page liquid-glass surface as Notifications, Control Center and All Apps.
- Clock, Calendar, Battery and Device premium widgets are all transparent/neutral with no rounded palette card behind them.
- Colab identifies this source as `beta13-personal-notify` and requires versionCode 34.

# Velora engineering rules

- Keep Velora lightweight. Prefer Android platform APIs and Jetpack over large third-party UI frameworks.
- Kotlin + Jetpack Compose is the primary stack.
- Home placement is truly freeform; never make a grid mandatory.
- Store positions as normalized coordinates so layouts survive resolution changes.
- Every expensive visual effect must have a cheap fallback path.
- Do not add analytics, tracking, ad SDKs, login systems, or cloud requirements without an explicit product decision.
- Do not add GitHub Actions CI. The primary build flow is local Gradle or Google Colab.
- Keep system-level capabilities optional. Notification access and Accessibility must degrade gracefully when disabled.
- Never imply that a normal launcher APK can permanently replace Android SystemUI.
- Prefer small focused modules and testable pure logic over one giant Activity.
- Preserve user layouts across upgrades.
- Treat battery, memory, launch latency and gesture responsiveness as product features.

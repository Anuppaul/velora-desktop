# Right-click menus: what Velora can style

Velora Desktop targets **GNOME Shell 50**. A right-click menu can belong to
GNOME Shell or to a *different application process*. Those are not the same
rendering surface.

| Right-click location | Owner | Velora Liquid Glass |
| --- | --- | --- |
| App Grid app icon | GNOME Shell PopupMenu / BoxPointer | Supported |
| Shell-owned Ubuntu Dock app menu | GNOME Shell PopupMenu / BoxPointer | Supported when implemented with native PopupMenu |
| Shell background menu, if exposed | GNOME Shell PopupMenu / BoxPointer | Supported |
| Ubuntu desktop wallpaper / desktop file icon (DING) | Desktop Icons NG separate GTK application | **Not** accessible to Shell GPU LiquidEffect |
| Files (Nautilus) / other GTK application | That GTK application | **Not** accessible to Shell GPU LiquidEffect |
| Browser or Electron page context menu | Browser/Electron application | **Not** accessible to Shell GPU LiquidEffect |

## Why a successful hot-swap may show no change

`Velora runtime hot-swap succeeded` means the **Shell extension runtime** was
updated. It does not mean GTK application popovers were modified.

PR #66 removed the unnecessary 120 ms hover-switch delay from Shell app
context menus, but did **not** change a GTK-owned card's appearance. Native
GNOME Shell menus already use the common PopupGlassSurface. A Shell menu with
a subclass-specific `open()` route could still bypass that adapter.

The new fallback observes only BoxPointer actors in the Shell's existing
`uiGroup` and their native `open-state-changed` events. It attaches
PopupGlassSurface only when one opens. The listener is disconnected on actor
destruction and extension disable; no new shader, GTK CSS injection, screenshot,
window capture pass or polling loop is introduced.

## Check which menu you are opening (read-only)

1. After a successful live install, right-click an **App Grid** icon, then
   an **Ubuntu Dock** icon. Compare these with a right-click on an empty
   desktop area and with **Files**.
2. Run `bash tools/diagnose_right_click_menu.sh` to see whether Desktop Icons
   NG is active and whether Velora logged native PopupMenu attachment.
3. A GNOME Shell popup should emit
   `[Velora][PopupGlass] attached ...` once the surface is set up.
   `native popup material not attached ...` means a native
   PopupMenu reached the adapter but does not match supported geometry.
4. A DING GTK menu will **not** emit a Velora PopupGlass event because it lives
   outside the Shell actor tree.

Do not modify the installed DING extension, inject global GTK CSS, make
GTK windows transparent, or insert Shell overlays above a GTK popup merely
to force a visual match. Those approaches cannot provide the real backdrop
to Velora's shader and risk GNOME Store review, desktop input and accessibility.

A true GTK app-menu visual theme would require a separate, explicitly opted-in
GTK styling project with independent testing and installation lifecycle.

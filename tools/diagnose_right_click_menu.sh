#!/usr/bin/env bash
# Read-only owner check for GNOME Shell versus GTK/DING context menus.
set -euo pipefail

printf 'Velora right-click menu owner diagnostic (read-only)\n'
if command -v gnome-shell >/dev/null 2>&1; then
    gnome-shell --version || true
fi
printf 'Session: %s\n' "${XDG_SESSION_TYPE:-unknown}"
printf '\nExtensions:\n'
if command -v gnome-extensions >/dev/null 2>&1; then
    if gnome-extensions info velora@wonderer.tech >/dev/null 2>&1; then
        gnome-extensions info velora@wonderer.tech | grep -i -E             '^(Velora|  (Name|State|Version|Path|UUID):)' || true
    else
        printf 'Velora is not known to this session.\n'
    fi

    enabled="$(gnome-extensions list --enabled 2>/dev/null || true)"
    if printf '%s\n' "$enabled" | grep -qiE 'ding|desktop.icons'; then
        printf '%s\n' "$enabled" | grep -iE 'ding|desktop.icons' || true
        printf 'Desktop Icons NG active: desktop background/file right-click is GTK-owned, not Shell PopupMenu.\n'
    else
        printf 'No DING extension found among enabled GNOME extensions.\n'
    fi
else
    printf 'gnome-extensions command not available.\n'
fi

printf '\nLatest Velora PopupGlass messages from current user session:\n'
if command -v journalctl >/dev/null 2>&1; then
    journalctl --user -b --no-pager -o cat 2>/dev/null |
        grep -F '[Velora][PopupGlass]' |
        tail -n 15 || true
fi

printf '\nCompare right-click in App Grid / Dock vs desktop background.\n'
printf 'Shell-native menus emit PopupGlass messages; GTK/DING menus do not.\n'

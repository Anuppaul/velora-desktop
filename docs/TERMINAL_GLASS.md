# Velora Terminal Glass — native Ptyxis appearance (opt-in)

**Stage 1: translucent terminal, not compositor-level Liquid Glass.** This
developer utility changes only the **selected native Ptyxis profile's**
background opacity through its existing GSettings key. It does not install
fonts, alter GTK globally, replace the terminal, change GNOME Shell, or add a
second GPU capture layer. It is excluded from the official GNOME Store ZIP.

The terminal process matters: \`xterm-256color\` is a TERM capability string,
**not** the terminal app name. On Ubuntu 26.04, the default terminal is often
Ptyxis, but do not assume that for every user.

## Check first (read-only)

\`\`\`bash
cd ~/Documents/code/velora-desktop
git pull origin main
python3 tools/velora_terminal_glass.py status
\`\`\`

The script displays the best-effort terminal process ancestry, whether a
**native Ptyxis profile with the opacity key** exists, its current opacity
and whether there is a Velora backup to restore. If the schema/key is not
present, stop; the utility refuses to change anything. If process detection
returns unknown or another terminal, the profile output refers to Ptyxis
installed on your system, **not proof that your current window is Ptyxis**.

You can also inspect your shell's immediate parent without the nested \`ps\`
command that previously failed:

\`\`\`bash
ps -p "$PPID" -o pid=,ppid=,comm=
\`\`\`

Process ancestry may show a shell or wrapper; use Velora's diagnostic as an
additional hint. You can also open the terminal's About dialog.

## Apply (explicit user action)

\`\`\`bash
python3 tools/velora_terminal_glass.py apply
\`\`\`

This sets the default native Ptyxis profile to **0.88 opacity**
(12% transparency), while preserving the previous setting in:

\`\`\`text
~/.local/state/velora-desktop/terminal-glass.json
\`\`\`

If \`XDG_STATE_HOME\` is set, the backup lives under that directory instead.
The file is written with permissions 0600. **Do not use sudo**: these are
your own per-user GSettings.

For a slightly stronger treatment:

\`\`\`bash
python3 tools/velora_terminal_glass.py apply --opacity 0.82
\`\`\`

Allowed values are 0.65–0.98 to protect text legibility. Multiple applies
retain the original pre-Velora opacity. If the user or another tool changes
opacity independently, Velora refuses to overwrite it without explicit
recovery. Default profile only; use \`--profile UUID\` to target an existing
Ptyxis profile deliberately.

Ptyxis may require closing and reopening the terminal window to repaint a
changed alpha surface. GNOME logout/login and \`gnome-shell/install.sh\` are
**not** required because no GNOME Shell code was changed.

## Restore

\`\`\`bash
python3 tools/velora_terminal_glass.py restore
\`\`\`

This restores the original value and, where detected from dconf, restores the
unset/default state rather than pinning an unnecessary override. If another
app changed the same opacity after your last Velora apply, restoration
refuses to overwrite that change. Deliberately override with:

\`\`\`bash
python3 tools/velora_terminal_glass.py restore --force
\`\`\`

Do not delete the backup file until restoration is complete.

## Appearance and real limitations

- Translucent backgrounds may show wallpaper/window content through the
  terminal. Native text remains rendered by Ptyxis.
- GTK/Ptyxis does **not** gain Velora's refractive GPU shader or
  backdrop-blur through this setting. It is **not** frosted diffusion, and
  no application-window screenshot/blur loop was added.
- Color palette, font settings, window decorations, other terminal profiles,
  other apps, GTK theme and GNOME Shell extensions are untouched.
- Physical GNOME 50.1 + Wayland visual testing is still required. Test
  readability over light/dark backgrounds and text on an overlapping window.
- A separate optional compositor/window-manager integration would be needed
  for true backdrop blur, with proper security, lifetime and performance QA.
  Do not inject arbitrary Shell overlays over app windows.

**Maintainer notes:** Sources for Ptyxis opacity include upstream Ptyxis
documentation at https://github.com/kreed/ptyxis and the settings key
\`org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/UUID/ opacity\`.
The utility only attempts to read/write this key after validating the
installed schema and selected profile. Flatpak Ptyxis uses an app-specific
GSettings environment and is not modified by this first native-only version.

#!/usr/bin/env python3
"""Opt-in, reversible frosted GTK menu treatment for DING's GTK3 app.

This DOES NOT provide Velora's GNOME Shell refractive GPU shader/blur.
It patches only DING's own stylesheet and never touches global GTK themes.
No files are modified by the default status action.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

UUID = 'ding@rastersoft.com'
START = '/* VELORA-DING-WALLPAPER-MENU-BEGIN */'
END = '/* VELORA-DING-WALLPAPER-MENU-END */'
STYLE = '''__START__
/* The desktop wallpaper context menu belongs to the GTK DING process.
 * A translucent, theme-aware GTK card, NOT Velora's GPU refractive glass.
 * This rule applies only in DING because its OWN stylesheet loads it. */
popover.background.menu,
popover.menu.background {
    background-color: alpha(@theme_bg_color, 0.78);
    background-image: none;
    border: 1px solid alpha(@theme_fg_color, 0.16);
    border-radius: 18px;
    box-shadow: 0 10px 30px alpha(black, 0.25), inset 0 1px alpha(white, 0.16);
}
popover.background.menu modelbutton,
popover.menu.background modelbutton {
    border-radius: 10px;
    margin: 2px 3px;
}
popover.background.menu modelbutton:hover,
popover.background.menu modelbutton:focus,
popover.menu.background modelbutton:hover,
popover.menu.background modelbutton:focus {
    background-color: alpha(@theme_fg_color, 0.10);
}
popover.background.menu separator,
popover.menu.background separator {
    background-color: alpha(@theme_fg_color, 0.14);
}
/* Older DING builds use Gtk.Menu rather than a GtkPopover menu. */
menu {
    background-color: alpha(@theme_bg_color, 0.78);
    background-image: none;
    border: 1px solid alpha(@theme_fg_color, 0.16);
    border-radius: 18px;
    box-shadow: 0 10px 30px alpha(black, 0.25);
}
menu menuitem:hover,
menu menuitem:focus {
    background-color: alpha(@theme_fg_color, 0.10);
    border-radius: 9px;
}
__END__'''.replace('__START__', START).replace('__END__', END)


def default_dirs():
    home = Path.home()
    return [home / '.local/share/gnome-shell/extensions' / UUID,
            Path('/usr/share/gnome-shell/extensions') / UUID,
            Path('/usr/local/share/gnome-shell/extensions') / UUID]


def find_dir(explicit: str | None) -> Path:
    dirs = [Path(explicit)] if explicit else default_dirs()
    for dir_ in dirs:
        if (dir_ / 'metadata.json').is_file():
            return dir_.resolve()
    raise RuntimeError('DING directory not found; use --ding-dir PATH')


def detect_ding_gtk3(dir_: Path) -> Path:
    metadata = json.loads((dir_ / 'metadata.json').read_text(encoding='utf-8'))
    if metadata.get('uuid') != UUID:
        raise RuntimeError('Refusing: unexpected GNOME extension UUID')
    target = dir_ / 'app' / 'stylesheet.css'
    if not target.is_file() or target.is_symlink():
        raise RuntimeError('DING local GTK stylesheet unavailable (or symlink); no change made')
    css_loaders = []
    for file in (dir_ / 'app').glob('*.js'):
        source = file.read_text(encoding='utf-8', errors='replace')
        if (
            'gi://Gtk?version=4.0' in source or
            "gi.require_version('Gtk', '4.0')" in source or
            'Gtk.StyleContext.add_provider_for_display' in source
        ):
            raise RuntimeError('GTK4 DING detected; GTK3 menu CSS is not applicable. No change made.')
        if ('stylesheet.css' in source and
                re.search(r'load_from_(?:file|path)\s*\(', source)):
            css_loaders.append(file.name)
    if not css_loaders:
        raise RuntimeError('DING does not load app/stylesheet.css directly; likely GTK4/resources. Refusing patch.')
    return target


def write_atomic(target: Path, data: bytes) -> None:
    mode = target.stat().st_mode & 0o777
    fd, tmp = tempfile.mkstemp(prefix='.velora-ding-css-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def run(command: str, explicit: str | None) -> None:
    dir_ = find_dir(explicit)
    target = detect_ding_gtk3(dir_)
    original = target.read_text(encoding='utf-8')
    has_start, has_end = START in original, END in original
    if has_start != has_end or original.count(START) > 1 or original.count(END) > 1:
        raise RuntimeError('Partial/duplicate Velora markers; refusing to touch file')
    backup = target.with_name('stylesheet.css.velora-original')
    print(f'DING GTK3 stylesheet: {target}')
    print(f'Velora frosted menu style: {"APPLIED" if has_start else "NOT APPLIED"}')
    print('Actual GNOME Shell LiquidEffect/refraction: NOT AVAILABLE in GTK/DING')
    if command == 'status':
        print(f'Backup: {backup if backup.is_file() else "not created"}')
        return
    if command == 'apply':
        if has_start:
            print('Already applied (no change).')
            return
        if backup.exists():
            raise RuntimeError('Backup already exists without active markers; refusing overwrite')
        shutil.copy2(target, backup)
        write_atomic(target, (original.rstrip() + '\n\n' + STYLE + '\n').encode('utf-8'))
        print('Added DING-only GTK3 frosted context-menu styling. Original backed up.')
    elif command == 'restore':
        if not has_start:
            print('No Velora styling found (no change).')
            return
        first = original.index(START)
        last = original.index(END, first) + len(END)
        write_atomic(target, (original[:first].rstrip() + original[last:]).rstrip().encode('utf-8') + b'\n')
        print('Removed only Velora styling; left upstream CSS intact.')
    else:
        raise ValueError(command)
    print('Restart ONLY DING (via Extensions app toggle) if GTK does not reload CSS automatically.')
    print('No GNOME logout/login or Velora reinstall required.')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('command', nargs='?', default='status', choices=['status', 'apply', 'restore'])
    ap.add_argument('--ding-dir', default=None, help='DING extension directory, for nonstandard installs')
    args = ap.parse_args()
    try:
        run(args.command, args.ding_dir)
    except (OSError, ValueError, RuntimeError) as e:
        print('ERROR:', e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

# Support

Velora is a community open-source GNOME Shell extension.

## Supported environment

The current project line targets:

- **GNOME Shell 50**
- Ubuntu/GNOME environments running GNOME Shell 50

Other Shell versions are not currently claimed as supported unless explicitly documented.

## Before asking for help

Please check:

1. the [README](README.md);
2. the [Development Guide](docs/DEVELOPMENT.md);
3. existing [Issues](https://github.com/Anuppaul/velora-desktop/issues);
4. existing [Discussions](https://github.com/Anuppaul/velora-desktop/discussions).

Verify the extension is active:

```bash
gnome-extensions list --active | grep velora@wonderer.tech
```

Useful logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'
```

## Where to ask

### Reproducible bug

Use the GitHub bug-report template.

Include:

- GNOME Shell version;
- distribution/version;
- Wayland/X11 session;
- exact reproduction steps;
- expected behavior;
- actual behavior;
- relevant logs;
- screenshot/recording for visual issues.

### General question or setup help

Use [GitHub Discussions](https://github.com/Anuppaul/velora-desktop/discussions).

### Feature or design idea

Use a Discussion first when the design is still broad. Open a feature issue when the proposal is already scoped.

### Security vulnerability

Do **not** post exploit details publicly.

Read [SECURITY.md](SECURITY.md) and use private vulnerability reporting when available.

## Support boundaries

The project cannot guarantee support for:

- unsupported GNOME Shell versions;
- modified third-party forks;
- local changes not present in upstream Velora;
- unrelated GNOME extensions that conflict with Shell actors Velora also integrates with;
- distro-specific patches that cannot be reproduced upstream.

Compatibility reports are still welcome because they can help identify future work.

## No guaranteed response time

Velora is maintained as an open-source project without a paid support SLA.

Reports with clear reproduction steps and evidence are easier for maintainers and contributors to investigate.

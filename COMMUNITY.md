# Velora Community Hub

Welcome to the Velora community.

You do not need to be a GNOME Shell expert to contribute. Testing, documentation, accessibility feedback, design review and reproducible bug reports are all useful.

## Choose your path

### I found a bug

Open a bug report:

https://github.com/Anuppaul/velora-desktop/issues/new/choose

Include your GNOME Shell version, distribution, session, reproduction steps and relevant logs.

### I have an idea

Start a Discussion:

https://github.com/Anuppaul/velora-desktop/discussions

Use Discussions for ideas that still need design or architecture conversation before becoming an implementation task.

### I want to write code

Start with:

- [Good first issues](https://github.com/Anuppaul/velora-desktop/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
- [Help wanted](https://github.com/Anuppaul/velora-desktop/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22)
- [Contributor Map](docs/CONTRIBUTOR_MAP.md)
- [Development Guide](docs/DEVELOPMENT.md)

Before coding on an existing issue, comment with a short plan so contributors can coordinate and avoid duplicate work.

### I can test GNOME Shell 50

Testing is especially useful for:

- different GNOME Shell 50 distributions;
- Wayland and X11;
- multi-monitor setups;
- Ubuntu Dock/native Dock behavior;
- Quick Settings and Calendar;
- notifications;
- Orb geometry and paging;
- Spotlight keyboard behavior;
- extension disable/re-enable cleanup.

Compatibility evidence can be contributed without changing runtime code.

### I care about accessibility

Useful areas include:

- keyboard access;
- focus behavior;
- readable adaptive text;
- contrast against glass;
- predictable close/Escape behavior;
- pointer and keyboard coexistence;
- preserving native GNOME accessibility semantics.

Use an issue for a reproducible problem or a Discussion for broader accessibility design questions.

### I want to improve documentation

Documentation PRs are welcome.

Useful topics include:

- install/update clarity;
- screenshots;
- architecture explanations;
- compatibility evidence;
- regression checklists;
- contributor guides;
- troubleshooting.

## How work is coordinated

Velora uses lightweight coordination:

1. pick or open an issue;
2. comment with your plan;
3. keep one clear goal per PR;
4. attach evidence;
5. use the PR checklist;
6. coordinate in Discussions when the design is still open.

There is no permanent issue reservation system. If work becomes inactive, another contributor may continue it after coordinating in the issue.

## Project contract

The core rule is:

> **Native GNOME/Ubuntu behavior first. Velora changes supported material and adds focused Velora features without replacing the desktop interaction model.**

That means contributions should preserve native layout, controls, hit targets, accessibility and animation wherever possible.

## Recognition

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for how code, testing, documentation and review contributions are recognized.

## Security reports

If you believe you found a security vulnerability, **do not post exploit details in a public issue or discussion**.

Read [SECURITY.md](SECURITY.md) and use GitHub private vulnerability reporting when it is available for the repository.

## Community standards

Participation is covered by the [Community Code of Conduct](CODE_OF_CONDUCT.md).

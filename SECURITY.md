# Security Policy

Security reports are taken seriously.

Velora runs inside GNOME Shell, so a security-sensitive bug can affect the desktop session, extension state, local files, settings, or the integrity of the Shell process. Please use responsible disclosure for vulnerabilities that could cause harm if published before a fix is available.

## Supported versions

Velora currently targets **GNOME Shell 50**.

| Version | Security support |
| --- | --- |
| Current `main` branch on GNOME Shell 50 | Supported |
| Latest tagged/released build, when present | Supported while it matches the current GNOME Shell 50 line |
| Older commits or superseded builds | Best effort only |
| Modified forks or third-party repackaging | Not supported unless the issue also reproduces on current upstream Velora |

When possible, reproduce a report against the current `main` branch before submitting it.

## Reporting a vulnerability

**Do not open a public GitHub issue with exploit details, secrets, private data, or a working proof of concept for an unpatched vulnerability.**

Preferred reporting path:

1. Open the repository **Security** tab.
2. Use **Report a vulnerability** / private vulnerability reporting if GitHub offers it for this repository.
3. Include the information listed below.

If private vulnerability reporting is not available, open a **minimal, non-sensitive** issue titled:

```text
[Security] Private contact requested
```

Do not include the vulnerability details in that public issue. State only that you have a security report and need a private disclosure channel.

## What to include

A useful report contains:

- a concise description of the vulnerability;
- affected Velora commit/revision;
- GNOME Shell version;
- distribution/version;
- Wayland/X11 session where relevant;
- exact reproduction steps;
- expected vs actual security boundary;
- impact and realistic attack scenario;
- whether user interaction is required;
- relevant logs with personal data removed;
- a minimal proof of concept, if necessary to demonstrate the issue;
- suggested mitigation or patch, if you have one.

Please redact usernames, home-directory paths, tokens, credentials, private filenames, or other unrelated personal information from logs and screenshots.

## Security-relevant scope

Examples that belong in a private security report include:

- arbitrary command execution caused by Velora;
- unintended file creation, overwrite, deletion, or permission changes;
- privilege-boundary violations;
- unsafe use of shell commands or environment data;
- code execution through crafted settings, filenames, app metadata, or other untrusted input;
- persistence outside the documented GNOME extension installation/state model;
- unsafe loading or execution of untrusted code;
- vulnerabilities in the installer that could modify unintended paths;
- malicious or unexpected interaction with GNOME Shell extension lifecycle/state;
- sensitive-data exposure through logs, diagnostics, screenshots, or generated artifacts;
- supply-chain or vendored-code integrity problems;
- security-relevant dependency or provenance issues;
- a GNOME Shell crash or denial-of-service that can be triggered by untrusted input or a realistic attacker-controlled condition.

## Usually not a security vulnerability

These should normally use the public bug template instead:

- visual glitches;
- performance regressions without a security impact;
- ordinary extension crashes caused only by unsupported manual source edits;
- GNOME Shell compatibility bugs;
- broken preferences with no security boundary involved;
- expected access to files/settings already available to the logged-in user and intentionally required by Velora;
- issues that reproduce only in a modified third-party fork.

If you are unsure, prefer the private reporting path.

## Safe research expectations

Please:

- test only on systems and accounts you are authorized to use;
- avoid destructive testing against other users;
- minimize access to unrelated data;
- stop once you have enough evidence to demonstrate the vulnerability;
- do not use a vulnerability to access, alter, or publish data that is not yours;
- give maintainers a reasonable opportunity to investigate and fix the issue before public disclosure.

Good-faith research that follows these expectations is welcome.

## Response process

After receiving a report, the maintainers will try to:

1. confirm receipt;
2. reproduce and assess the issue;
3. determine affected versions and severity;
4. prepare a fix or mitigation;
5. coordinate disclosure when appropriate.

Response and remediation time depends on severity, reproducibility, GNOME Shell behavior, and whether upstream or vendored components are involved.

A report may be closed as non-security if it does not cross a meaningful security boundary. In that case, a sanitized public issue may be suggested.

## Coordinated disclosure

Please do not publish exploit details for an unpatched vulnerability before coordination with the maintainers.

When a fix is ready, the project may publish a security advisory, release note, or public issue containing enough information for users to understand the impact and update safely.

Credit will be given to reporters who want it, unless legal, privacy, or safety considerations prevent attribution.

## Dependencies, vendored code, and provenance

Velora includes vendored/derived components whose license and provenance notices must remain intact.

If a vulnerability originates in vendored code:

- report it to Velora if the affected code ships with or is exercised by Velora;
- upstream reporting may also be appropriate;
- do not remove or rewrite attribution/provenance while preparing a security fix.

## Security-sensitive pull requests

Do not submit a public pull request that reveals an exploitable unpatched vulnerability before coordinated disclosure.

Security fixes may be prepared privately first and moved to the normal public review flow once disclosure is safe.

## Non-security reports

For ordinary bugs, feature requests, contributor questions, and compatibility issues, use the normal project channels:

- Issues: https://github.com/Anuppaul/velora-desktop/issues
- Discussions: https://github.com/Anuppaul/velora-desktop/discussions
- Contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md)

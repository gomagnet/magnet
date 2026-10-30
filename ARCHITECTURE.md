# Go package layout

Magnet uses four modules joined by `go.work`. The Server, Link and Status module roots remain executable packages, with small `main.go` files calling internal application entry points. Installation paths, flags, API routes and wire formats are unchanged by this organization.

| Module | Package | Responsibility |
| --- | --- | --- |
| MagnetServer | `internal/server` | Server lifetime, setup, authentication, access checks, API handlers, schemas, server-group membership/grants, private package uploads/download routes, Link streams, jobs, alerts and monitoring checks |
| MagnetServer | `internal/config` | YAML settings, validation and private administrator-key creation |
| MagnetServer | `internal/datastore` | MariaDB connection construction, pool configuration, connectivity checks and database creation |
| MagnetServer | `internal/middleware` | Gin scanner detection and temporary IP blocking, shared by setup and configured routers |
| MagnetServer | `web` | Embedded dashboard, login/setup pages and Monaco assets |
| MagnetLink | `internal/agent` | Enrollment, configuration persistence, transport, job scheduling, authenticated package downloads, updater and service lifetime |
| MagnetLink | `internal/jobs` | Job dispatch, package/container/Compose/systemd/cron/shell operations |
| MagnetLink | `internal/cleanup` | Bounded disk scans, expiring deletion plans, selected filesystem/Docker cleanup and mount protection |
| MagnetLink | `internal/process` | Bounded subprocess output, process-group cancellation and input handling |
| MagnetLink | `internal/joboutput` | Bounded JSON result encoding |
| MagnetLink | `internal/users` | Local Linux user management |
| MagnetLink | `internal/files` | Link-process-user file management and shell operations |
| MagnetLink | `internal/database` | MariaDB operations, account management and table data grid |
| MagnetLink | `internal/telemetry` | Linux CPU, memory, disk, uptime and network resource sampling |
| MagnetShared | `netutil` | Shared public IPv4 literal validation, independent of transport authentication |
| MagnetShared | `protocol` | Encrypted Link and updater contracts, cryptography and binary release inspection |
| MagnetShared | `status` | Versioned public status snapshot types |
| MagnetShared | `web` | Shared embedded browser scrollbar assets |
| MagnetStatus | `internal/status` | Public HTTP routes, renderer state, remote snapshot polling and service installation |
| MagnetStatus | `internal/config` | Renderer credential settings, validation and atomic persistence |
| MagnetStatus | `web` | Embedded public status UI |

## Dependency rules

- Entry points call their application's `Run` function. Link passes the release version embedded by its root `version.go`; `MagnetLink/link-release.txt` stays the single release-marker source.
- Executable implementation stays internal to its module. Do not import another executable's internal packages.
- Shared packages never depend on Server, Link or Status. Protocol, public status types and presentation assets have independent import paths.
- Link's agent depends on jobs and telemetry. Jobs dispatch to users/files/database/cleanup packages; those packages depend on process and joboutput helpers and never import the agent or dispatcher.
- Server handlers and schema methods remain with their shared application state, rather than creating cross-package access to private session/security state. Configuration, connection construction and middleware depend on no server handler types.
- Browser files remain in their existing `web/` folders. Explicit embed patterns exclude Go source files. Server handlers continue to protect dashboard and Monaco assets before serving their contents.

## Static checks

Follow `GPT-README.MD`: do not build, create unit tests, run tests, or start services. Go formatting and `go vet -tests=false` across all four modules are permitted; use a Linux target for Link. JavaScript syntax checks remain unchanged because browser source paths are preserved.


## Per-core telemetry, public server availability and inner navigation (Link 0.4.7)

- Detailed server overview includes live utilization for every reported logical CPU. Link samples aggregate and `cpuN` counters from `/proc/stat`, excludes duplicate guest counters, handles counter resets/hot-plugged CPUs, and reports a null usage until a delta is available. Offline servers do not show stale percentages as live. Collection is capped at 4,096 logical CPUs. Existing Links remain compatible; update Link to 0.4.7 for core readings. `nodes.metrics` is upgraded from TEXT to MEDIUMTEXT idempotently; historical samples retain aggregate metrics only.
- Status page editor → Services has an opt-in **Self server status** checkbox, default off. It publishes names and current availability of the linked servers using authenticated Link connections and heartbeat freshness, including offline/uninstalled servers. Enabling publication requires View access to every linked source server, including retained associations. No addresses, credentials or resource metrics enter the public snapshot. Additive `kind: "server"` and `last_seen` fields identify these entries; IDs are page-scoped hashes. The public renderer shows heartbeat availability without fabricated latency/uptime history. This is not an external reachability probe.
- Server and server-group icon editors offer 20 locally bundled [Google Material Symbols](https://developers.google.com/fonts/docs/material_symbols) presets plus existing PNG/SVG uploads. Presets use validated `material:<name>` values, with one embedded JSON manifest shared by browser picker and Go validation. Group fallback remains unchanged; avatar validation stays image-only. Font, manifest, notices and dashboard scripts retain authentication. Preserve Google's bundled Apache 2.0 license and notice. No runtime Google CDN is used.
- Status page sections, account/access editors, database tools and Docker tools use sidebar-style inner navigation and cancellable exit/entry animations. Reduced motion skips animations. Form panels stay mounted for account and status editors; validation reveals invalid sections synchronously. Rapid switches invalidate earlier transitions and detached/closed contexts cannot commit late UI updates. Desktop menus are vertical; narrow screens use a compact two-column menu.
- Verification remains static-only: no builds, tests, application startup, browser sessions or database migrations are executed by the coding agent.


## Guided systemd and cron management (Link 0.4.8)

- **Startup & cron → Create service** opens a guided modal with startup one-shot, always-restart, restart-on-failure and manual one-shot presets. Configure unit name, description, shell command/script, Linux execution user, working directory, network ordering, restart delay, boot enablement and optional immediate start. One-shot means once per activation/boot, not an automatically deleted one-time installation. Preview requests return the exact generated unit without changing the host. Commands run through `/bin/sh -c`, output goes to journald, and continuous tasks must stay in the foreground. Start requests are nonblocking; the service row reports the actual state.
- Link validates names, accounts, directories, options and command bounds, escapes systemd specifiers/ExecStart expansion, and refuses existing loaded/vendor/masked/local unit names. A complete temporary file is published to `/etc/systemd/system/<name>.service` atomically with a non-replacing hard link. Daemon reload, enablement and optional start report partial failures explicitly; do not automatically repeat a creation whose file already exists. No existing service is overwritten. Existing override editing remains available separately.
- **Scheduled tasks** displays task name/command, a readable schedule, the raw expression, enabled/paused state and Edit/Pause/Resume/Delete actions. Presets cover every N minutes, hourly, daily, weekdays, weekly, monthly and `@reboot`, plus a validated custom five-field expression/standard alias. The UI shows the Link execution user and host timezone; it does not fabricate next-run timestamps. Cron must be installed/running. Existing shell/environment settings are retained; cron's percent-sign/stdin semantics apply. Advanced crontab editing remains available.
- The cron editor changes only the selected task line and its optional `# Magnet task: ` name comment. Pausing uses `# Magnet paused: `; unrelated comments/environment assignments and unsupported entries remain intact. Advanced unsaved edits must be saved or discarded first. Browser drafts and async results stay scoped to node, modal and crontab revision.
- `cron.snapshot` returns bounded content, SHA-256 revision, execution user and host timezone; `cron.replace` requires the expected revision. Link serializes its cron operations, rechecks before installation, backs up the prior content at `/etc/magnet/crontab.backup`, installs via `crontab`, and returns actual readback. The final syntax authority is the installed crontab implementation. An empty table becomes a comment. External `crontab` writers have no atomic compare-and-swap API; a last-moment external edit after the check remains a system-level race. Legacy `cron.read`/`cron.write` still work, with bounded reads/writes and checked backup reads.
- New `service.create`, `service.preview`, `cron.snapshot` and `cron.replace` jobs use the existing server Manage permission, enrolled/recent TOTP and encrypted job-argument storage. Dashboard assets remain session-protected. Update Link to 0.4.8 for these features. No real services, crontabs, application instances, tests or builds are run as implementation validation.

References: [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html), [Debian crontab](https://manpages.debian.org/bookworm/cron/crontab.5.en.html).


## Uplink rates and per-resource warnings (Link 0.4.9)

- Network readings use two rows: down arrow for inbound RX and up arrow for outbound TX, each with a per-second value. Fleet rows, overview tiles and server quick details share the renderer. Aggregates never silently mix older all-interface counters with uplink measurements; update Link to 0.4.9. Unknown/offline/first-sample readings show dashes with an explanatory accessible label/tooltip.
- Link uses bounded read-only `ip -j -4/-6 route get` lookups for public destinations (1.1.1.1 and 2606:4700:4700::1111); lookups send no packets and change no routes. Only the selected active Internet-route interfaces are sampled from sysfs, with deduplicated IPv4/IPv6 interfaces and excluded loopback/container/virtual-LAN adapter names. There is no fallback to summing all adapters. Per-interface deltas handle counter resets, identity changes and route changes without synthetic spikes. `network_scope`, `network_interfaces` and `network_ready` are additive protocol metadata; RX/TX retain bytes-per-second units. iproute2 is required on Link hosts.
- These are **uplink interface rates**, not exact per-destination Internet byte accounting: LAN traffic sharing an uplink is included. Route probes select typical Internet paths, not every possible policy/ECMP path. Split-family tunnel/physical paths may include encapsulation traffic. The tooltip states the shared-LAN limitation. No packet capture, firewall rules or host configuration changes are installed. Strict Internet-only accounting would require a separate packet-accounting mechanism.
- CPU, memory and root-disk percentages each show their own circled-exclamation indicator at 80% (yellow) or 95% (red), retaining the existing thresholds. Warning icons are removed from the online status column. Detailed utilization tiles/core readings also warn beside the affected reading. Offline servers suppress stale warnings. Warning focus/click does not navigate the server row.
- Only static verification is permitted; no traffic generation, live route probes, applications, builds or tests are run as validation.


## Wider fleet meters, interactive charts and expanded icons

- Fleet table resource tracks are 100px wide (twice the original 50px), preserving values and warning icons alongside each meter. Tables scroll when horizontal space is limited.
- Resource charts offer CPU, Memory and Network. Network plots separate inbound/outbound uplink byte rates from ready `internet-uplink-v1` historical samples; legacy all-interface/missing/first-sample values are left blank. A vertical crosshair snaps to the nearest recorded sample with an in-panel tooltip containing its timestamp and values (network also includes raw B/s). Left/Right/Home/End inspect points by keyboard; Escape/blur/pointer exit dismiss the hint. Missing intervals break plotted lines instead of fabricating zeros or interpolation across gaps. The one-hour time scale and telemetry storage contract remain unchanged. Chart code is in private `MagnetServer/web/charts.js`.
- Server/group presets expand from 20 to 68 Google Material Symbols, using the matching locally bundled WOFF2 subset and embedded manifest/validation whitelist. The searchable picker matches glyph names, English labels and localized labels, preserving selection while filtering. Numeric glyph names such as `package_2` render correctly. Preserve the existing Apache license and updated font notice; no runtime CDN dependency.
- Static validation only: no builds, tests, application startup or browser validation.

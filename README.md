# 🧲 Magnet

A self-hosted dashboard for your Debian and Ubuntu servers. Keep an eye on server health, manage software, and handle everyday tasks from your browser.
A lightweight but trusted friend for a technical admin.

![Dashboard](images/dashboard.png)

## Features

- CPU, memory, disk, and network monitoring
- Package installation and updates across multiple servers
- Disk usage analysis and selective cache, Docker, and large-file cleanup
- Docker containers, Compose, systemd services, and cron jobs
- Linux users, terminal commands, and file editing
- MariaDB management and SQL editor
- Alerts and public status pages
- User accounts, server groups, two-factor authentication, and OpenID Connect login
- Light and dark themes

![Dashboard](images/startup-n-cron.png)

## ⚡ Quick start
- Download MagnetServer to some separate folder
- Run the server using `./MagnetLink -install`
- Read admin password: `journalctl -u magnet-server.service -n 20 --no-pager`
- Set up reverse proxy (nginx, caddy etc) or just open `http://localhost:8080`
- Log in as admin, open servers page and click `Connect` -> `Generate setup command`
- Place another copy of MagnetLink on another server and run generated command
- Done!

For MagnetStatus  the process is generally same.

## Getting started

You'll need Debian or Ubuntu with systemd, a MariaDB database account, and the `MagnetServer` and `MagnetLink` executables for your machines.

### 1. Start the dashboard

On your management server:

```sh
chmod +x MagnetServer
sudo ./MagnetServer -install
```

Find the temporary setup password:

```sh
sudo journalctl -u magnet-server.service -n 20 --no-pager
```

Open `http://YOUR_SERVER_IP:8080`, sign in as **admin** with that password, and follow the setup page. Enter your MariaDB settings and save the administrator key shown when setup finishes.

Use HTTPS or an SSH tunnel when accessing setup or the dashboard remotely.

### 2. Connect a server

Copy `MagnetLink` to the server you want to manage:

```sh
chmod +x MagnetLink
```

In the dashboard, click **Connect server**. Copy the generated command and run it on that machine. Once connected, the server appears in your dashboard.

Link connects back to MagnetServer, so it doesn't need an SSH server or an inbound management port. The installed agent runs as root to manage the machine.

### 3. Open your server

Click a server to see its resource usage and management tools. Use **All servers** to return to your fleet.

## More information

- [Example configuration](MagnetServer/magnet.example.yaml)
- [Users, permissions, and single sign-on](MagnetServer/ACCESS.md)
- [Public status pages](MagnetStatus/README.md)
- [Source layout](ARCHITECTURE.md)

Magnet is written in Go. The browser interface is bundled with the executables; no Node.js installation is needed.

## License

Magnet is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Uses outside its permissions require a [commercial license](LICENSE-COMMERCIAL.md). See [licensing details](LICENSING.md).

For commercial licensing, contact [andreybest20027@gmail.com](mailto:andreybest20027@gmail.com).

Copyright (c) 2026 shoker137.


### Repositories, DNS, icons and avatars

Link 0.4.2 adds repository file management in **Apps & packages** and persistent resolver configuration in a server's **DNS** screen. The screen reports the OS release and detected resolver manager. Supported configurations are systemd-resolved, NetworkManager global DNS, resolvconf and unmanaged static resolv.conf. Unsupported manager layouts are identified before saving. Configuration files are backed up; a failed DNS reload restores the previous file. Existing signing keys remain in place; repository entries can reference installed keyrings with `Signed-By`.

**Edit node** accepts PNG/SVG server icons; **Settings → Avatar** changes your avatar. Uploads are limited to 256 KiB and passive SVG or PNG up to 4096 × 4096. OpenID profile pictures refresh after each completed login, including personal MFA, and are downloaded over HTTPS without OAuth credentials, resized to at most 256px and stored in Magnet.

Resource charts and server details are in **Overview**. Previous server Monitoring bookmarks open Overview. Server public IPv4 addresses appear after hovering or focusing for half a second.

When nginx proxies MagnetServer, send the original client address:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Magnet trusts loopback proxies by default. Updated Links report their own public IPv4 on authenticated telemetry; the connection address is only a compatibility fallback for older Links. For a proxy on another host/container network, add only that trusted proxy address or CIDR to `trusted_proxies` in `magnet.yaml`; restart MagnetServer after changing configuration. Set `trusted_proxies: []` to disable forwarded-header trust. Do not configure untrusted/public client networks as proxies.

### Disk cleanup

With MagnetLink 0.4.4, open a server’s **Cleanup** screen and scan a folder to see disk usage and cleanup candidates. Select individual entries, review the exact deletion list and confirm. Large files/folders, stopped containers and unused volumes can hold important data and require an additional acknowledgment. Caches are suggested individually; Docker cleanup preserves resources referenced by containers and never uses force or broad prune commands.

Scans expire after 20 minutes and can be used once. Changed files and resources that become used are preserved; partial operations are reported. Scan other mounted disks separately. Folder totals and shared Docker layers overlap, so reported sizes are estimates. Protected system paths, mount aliases and folders too large to snapshot safely remain visible for analysis without deletion controls.

### Server groups and sensitive access

Use **Servers → Server groups** to group servers by name, color and icon, and grant user groups View or Manage access to all current and future members. Grouped servers appear first with colored branches; a group icon is inherited by servers without their own icon. Changing membership or deleting a group changes inherited access, while servers and independent grants are preserved.

Local sign-in requires a username. Use **admin** for the recovery administrator and first-time setup. Before sensitive tools become available, set up your personal authenticator under **Settings**. Accounts without TOTP can still view ordinary fleet metadata and enroll their authenticator. See [access documentation](MagnetServer/ACCESS.md) for migration and permission details.

### Public IPv4 detection

Link 0.4.6 reports a public IPv4 instead of the address of a reverse proxy, private network or IPv6 connection. It prefers a unique public IPv4 assigned to an active interface. For NAT or ambiguous interfaces, it discovers the public outbound IPv4 using the [ipify IPv4 API](https://www.ipify.org/) over direct HTTPS, without sending Link credentials or node identifiers. Discovery is cached and refreshed outside telemetry; failed discovery is shown as **Not detected**, never as a private address. NAT detection identifies outbound connectivity and does not guarantee inbound reachability.

Update MagnetServer and Link for this behavior. Older Links only have the trusted-proxy-aware public connection-address fallback; private/IPv6 values already saved in the database are hidden from the UI.


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

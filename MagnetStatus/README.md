# MagnetStatus

MagnetStatus hosts a public status page. MagnetServer runs all checks, stores
history in MariaDB, and manages page settings, incidents and maintenance.
MagnetStatus has no database and no administrator interface. Its read-only API
key stays on the renderer host and is never sent to a visitor's browser.

## Configure in MagnetServer

Open **Monitorings** in the workspace to create an independent status page.
In **Customize & order**, select any number of servers (up to 100), then choose
which of their services to publish. Drag the service rows or use their arrows
to set the public order. Each monitoring has its own renderer and API key.

Create reusable server services inside the server's **Services** screen. The
same server service can be selected by several monitorings and retains one
check schedule/history. A monitoring can also create **custom services** directly
with **New custom service**, then select them in **Customize & order**. These
belong exclusively to that monitoring and require no server. They support all
the same check types; "custom service" describes its ownership, while "custom
HTTP request" describes a check type.

Removing a server from a monitoring removes its published service selections
without deleting its checks. Deleting a server removes its own services and
their history, while workspace monitorings and their custom services remain.
Deleting a monitoring removes its custom services/history, notices and key,
while reusable server services remain.
Creating a monitoring generates its install command when MagnetServer has an
HTTPS public URL. **Install / rotate key** generates another command and
immediately revokes the previous renderer key. Deleting the monitoring revokes
access too; removing a server does not revoke a workspace page's key.

Startup migrates previous server-owned status pages into workspace pages,
preserving their IDs, API keys, service selections/order, incidents and history.
The former owner becomes the first selected server. MariaDB schema ALTER
permission is needed; migration steps can resume after an interrupted startup.
The public `/status/v1/<page-id>` contract is unchanged, so existing renderers
keep their credentials. Old server monitoring bookmarks open workspace Monitorings.

Customization includes the public title, description, HTTPS logo and website
links, accent color, footer and light/dark/system theme. Visitors can override
the theme locally. **Preview** shows the public service selection/status in the
admin panel; the full public layout is served by the installed renderer.

## Install

Place the packaged Linux `MagnetStatus` executable on the renderer host and run
the command from MagnetServer. It follows this form:

```sh
sudo ./MagnetStatus -server 'https://magnet.example.com' -page 'MONITORING_ID' -key 'API_KEY' -install
```

The noninteractive installer creates the `magnet-status` system account,
installs `/usr/local/lib/magnet-status/MagnetStatus`, writes a private
`/etc/magnet-status/status.yaml`, and enables/restarts `magnet-status.service`.
The default public listener is `0.0.0.0:8081`. To bind only a local reverse proxy,
append `-listen 127.0.0.1:8081` to the install command. Use `-tls-cert` and
`-tls-key` together for native public HTTPS. The certificate files must be
readable by the service account. The service runs without root privileges, so
use an unprivileged port such as 8081 or 8443. Custom `-config` paths must be
traversable/readable by the service account and outside protected home folders.

MagnetStatus always connects to MagnetServer using HTTPS with normal certificate
validation and redirects disabled. There is no insecure certificate bypass.
MagnetServer may terminate TLS itself or use a reverse proxy with its configured
HTTPS `public_url`; restrict the backend HTTP listener to the trusted proxy.
There is no API-key delivery over HTTP from the renderer.

For foreground use, supply an existing private YAML file with `-config`, or
pass `-server`, `-page`, `-key` and optionally `-listen`. Foreground flags do not
persist credentials. Re-running the install command replaces the configured
renderer key and restarts the service. One installation hosts one monitoring.
Separate hosts can render other monitorings; a second monitoring needs its own
process/configuration/listener and service unit.

## Checks and history

- Website: HTTP or HTTPS GET; any 2xx status by default, or one explicit expected
  status. Redirects are intentionally disabled; monitor the final URL or set
  the expected redirect status explicitly.
- Minecraft: Java edition modern server-list status handshake, explicit
  `host:port`, with bounded packet lengths and JSON validation. Latency measures
  connection plus the status response. Bedrock UDP, legacy pings and DNS SRV
  resolution are not implemented. Protocol flow reference:
  [PrismarineJS Minecraft client implementation](https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/src/ping.js).
- Custom HTTP: method, encrypted request headers/body, expected status, raw-text
  equals/not-equals/contains/not-contains/starts-with/ends-with validation, or
  nested JSON extraction via an RFC 6901 JSON Pointer such as `/data/healthy`
  or `/items/0/status`. Escape property-name `/` as `~1` and `~` as `~0`.
  Extracted strings match as text; booleans, numbers, null and objects match their
  JSON representation. Comparisons are case-sensitive. Body validation is
  bounded to 1 MiB of decoded response content.

Check intervals range from 30 to 3600 seconds. Eight workers run from MagnetServer
with ten-second deadlines, persistent scheduling leases and no command queue.
Slow checks and large inventories can delay their scheduled cadence. Missing,
paused or stale checks appear as awaiting data. Only the name, description,
public state, timestamp, latency and aggregated history reach the renderer;
targets, request secrets and internal errors stay private. Admin editing of
check configuration observes the existing TOTP verification policy. Check
destinations may use private networks because this is an administrator feature;
only configure trusted destinations, especially for methods that mutate data.

Results are counters (checks, failures, total latency) in five-minute buckets
retained for seven days and UTC daily buckets retained for 90 days. Cleanup is
hourly. There is no row per ping or response-body storage. The public page defaults
to 90 hourly bars, aggregated from the five-minute counters, with an optional
90-day view. Both show sample-weighted successful-check uptime; periods without checks
remain unknown and are not counted as healthy. Dates use the browser's timezone.
Incidents and maintenance appear before services; resolved/completed notices use green.
Maintenance does not exclude
failed checks from uptime. Check edits retain previous aggregate history.

The renderer fetches `/status/v1/<page-id>` with `Authorization: Bearer <key>`
every 15 seconds and serves the sanitized snapshot locally at `/api/status`.
The shared contract is version 1 in `MagnetShared/status.go`. Old snapshots show
an explicit delayed-data message, and service states become unknown after 90
seconds without fresh data. Memory-only cache is lost on renderer restart; the
page shows temporary unavailability until a successful fetch. There is no
external JavaScript/CSS dependency or frontend build step.

## Incidents and maintenance

Incidents progress through investigating, identified, monitoring and resolved.
Maintenance progresses through scheduled, in progress, verifying and completed.
Updates append public text to the timeline; stages cannot move backwards and
completed records cannot be edited. Records can be explicitly deleted. Active
incidents set the affected service impact, while active maintenance marks the
services as under maintenance; an independently detected outage takes priority.
Check outages update service status automatically; creating a written incident
is an administrator action.

Maintenance automatically starts at its start time and completes at its end
time, appending timeline updates. The scheduler persists transitions every five
seconds; snapshot projection applies boundaries immediately, including after
server downtime. Completion signifies the end of the announced window, not a
successful health check. Existing outages continue to be displayed.

Each page supports up to 100 published services and 100 active records. The
admin list and public feed prioritize active records and include up to 200
records total. Complete timelines are retained in MariaDB; admin history shows
up to 100 updates per incident (98 manual updates for maintenance, reserving
automatic transitions). The public feed includes the latest 20 updates per
record. These bounds keep snapshot memory and response size predictable.

## Validation

Repository policy allows static checks only: `gofmt`, JavaScript `node --check`,
and Linux-targeted `go vet -tests=false`. Do not build, run tests, start services,
or open a browser to validate this change.

## Usage

Open the add-on from the Home Assistant sidebar, then press **+** to add a
VNC target. Clicking a target opens a menu with actions to connect, edit, or
delete it.

Up to four targets can be open at the same time. Use the compact controls at
the bottom of the dashboard to switch between grid, column, and row layouts.
Changing a target takes effect immediately and does not require restarting the
add-on.

Targets, the selected layout, and the set of open screens are stored in the
browser and restored the next time the dashboard is opened. VNC credentials
are deliberately kept only for the current page and are never persisted.

## Configuration

The add-on no longer requires a fixed server in its YAML configuration. All
targets are managed from the dashboard. On an upgrade, an existing
`vnc_server_host` and `vnc_server_port` are imported as the initial target for
backward compatibility. The old password is not copied into browser storage.

## Usage

Open the add-on from the Home Assistant sidebar, then press **+** to add a
VNC target. Clicking a target opens a menu with actions to connect, edit, or
delete it.

Up to four targets can be open at the same time. Use the compact controls at
the bottom of the dashboard to switch between grid, column, and row layouts.
Changing a target takes effect immediately and does not require restarting the
add-on.

After opening the desired targets and choosing a layout, press the **+** beside
the profile list to save that arrangement. Select a profile to apply it, or use
its menu to update, rename, or delete it. Applying a profile first disconnects
all current VNC sessions and then opens only the saved targets.

The dashboard always shows the browser's standard arrow cursor over VNC
screens. This keeps pointer control visible with touch-oriented HMI servers
that intentionally provide a transparent remote cursor.

Targets, profiles, the selected layout, and the set of open screens are stored
in the browser and restored the next time the dashboard is opened.

If several targets share the same login, enable **Remember and use for all
targets** in the authentication dialog. The credentials will be reused for
subsequent screens and visits. This is opt-in because the value is stored as
plain text in this browser's local storage. Use it only on a trusted device and
press **Clear credentials** in the footer when it should be removed. Without
this option, credentials remain in memory only for the current page.

## Configuration

The add-on no longer requires a fixed server in its YAML configuration. All
targets are managed from the dashboard. On an upgrade, an existing
`vnc_server_host` and `vnc_server_port` are imported as the initial target for
backward compatibility. The old password is not copied into browser storage.

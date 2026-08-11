# Home Assistant Multi VNC Monitor

Bundles noVNC in a Home Assistant app and provides a persistent dashboard for
monitoring up to four VNC servers at once.

![Addon Stage][stage-badge]
![Supports aarch64 Architecture][aarch64-badge]
![Supports amd64 Architecture][amd64-badge]

[![Add repository on my Home Assistant][repository-badge]][repository-url]

## Features

- Add, edit, connect, and delete VNC targets without restarting the app.
- Monitor up to four targets simultaneously.
- Save reusable profiles for different groups of up to four screens.
- Switch between grid, column, and row layouts.
- Keep a standard arrow visible when an HMI hides its remote cursor.
- Restore targets, profiles, layout, and open screens from browser storage.
- Optionally remember and reuse one shared credential set in this browser.

## Installation

Use the button above or add this repository to the Home Assistant App Store:

```text
https://github.com/Refina20/homeassistant-vnc-monitor
```

Install **VNC Viewer**, start it, and enable **Show in sidebar**.

Open the screens you want, choose a layout, then use the **+** beside
**Monitor profiles** to save the combination. Selecting a profile disconnects
the current screens before opening the saved set, so inactive profiles do not
continue consuming VNC connections.

When a server requests authentication, **Remember and use for all targets**
can reuse the same credentials for the other screens. This opt-in stores the
credentials as plain text in this browser's local storage; use it only on a
trusted Home Assistant device. The saved value can be removed with **Clear
credentials**.

## Credits

Based on the original Apache-2.0 licensed
[VNC Viewer](https://github.com/Poeschl-HomeAssistant-Addons/vnc-viewer) app.

[stage-badge]: https://img.shields.io/badge/Addon%20stage-stable-green.svg
[aarch64-badge]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-badge]: https://img.shields.io/badge/amd64-yes-green.svg
[repository-badge]: https://img.shields.io/badge/Add-repository-41BDF5?logo=home-assistant&style=for-the-badge
[repository-url]: https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FRefina20%2Fhomeassistant-vnc-monitor

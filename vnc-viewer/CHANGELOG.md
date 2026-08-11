# Changelog

## 1.1.0

- Keep each monitor title bar above the VNC canvas instead of covering it.
- Add reusable monitor profiles containing up to four targets and a layout.
- Disconnect the current screens before applying another profile.
- Optionally remember one shared VNC credential set in browser storage and
  apply it to all targets, with a control to clear it at any time.

## 1.0.1

- Always show the browser's standard arrow cursor over VNC screens, including
  when an HMI server sends a transparent or hidden cursor.

## 1.0.0

- Add a persistent target list with add, edit, connect, and delete actions.
- Support up to four simultaneous VNC screens.
- Add grid, column, and row layouts.
- Restore targets, open screens, and layout from browser storage.
- Select VNC proxy targets dynamically without restarting the app.
- Import the legacy single-target host and port on first use.

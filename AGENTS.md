# AGENTS.md — Shoal Architectural Invariants & Engineering Standards

## 1. Global Engineering Philosophy

Shoal (`shoal@ubermetroid.github.io`) is built on four uncompromising engineering pillars:

1. **Linus Torvalds' "Good Taste"**: Eliminate special-case branching through clean data representation (immutable frozen enums, unified StatusNotifierItem / Ayatana service address parsing, and pure icon-style evaluators).
2. **UNIX Philosophy**: Each module ("page") does one thing well, composes cleanly via explicit ES2022 imports, and avoids hidden global state.
3. **NASA JPL Power-of-10 Safety Rules**:
   - All D-Bus service scans (`watcher.js`) and DBusMenu recursive tree builders (`dbus_menu.js`) enforce explicit upper iteration bounds (`MAX_SCAN_NAMES = 256`, `MAX_MENU_ITEMS = 96`).
   - Zero dynamic code evaluation (`eval`, `Function`) and zero external subprocesses (`Gio.Subprocess`, `GLib.spawn_*`) in the compositor.
   - All `GLib.timeout_add` sources are deterministically named via `GLib.Source.set_name_by_id` and removed on teardown.
4. **OWASP Zero-Trust & Multi-Distro Security**:
   - Zero shell subprocesses (`tools/busAnalyzer.js` eliminated) or `systemctl`/`pkexec` calls; integrates natively with `systemd-logind` lock/suspend via `"session-modes": ["user"]` and cancellable `Gio.DBus.session` calls across Fedora, Debian, Ubuntu, Arch, openSUSE, and NixOS.
   - All ARGB32 pixmap byte buffers are length-bounded and validated before rendering.

---

## 2. The Page Rule & Directory Density (Enforced by `tests/verify.js`)

- **File Line Bounds**: Every `.js` source file in the repository (`extension/`, `tests/`) **must** be between **16 and 256 lines** (`16..=256`), and every line **must** be at most **200 characters** (`<= 200`).
- **Directory Density**: Every directory in the repository (`root`, `tests/`, `extension/`, and all subdirectories) **must** contain **at most 8 visible entries** (`<= 8`).
- **Banned Generic Names**: Generic grab-bag names (`util`, `utils`, `lib`, `helper`, `helpers`, `common`, `misc`, `shared`, `base`, `core`, `types`, `mod`) are strictly forbidden.
- **2-Line SPDX + Concise Module Header**:
   - Line 1 of every `.js` file must be `// SPDX-License-Identifier: GPL-3.0-or-later`.
   - Line 2 of every `.js` file must be a concise single-line module description (`// <Concise module description>`).

---

## 3. Process-Boundary & GNOME Shell / EGO Lifecycle Invariants (`tests/verify.js`)

- **ES2022 Strictness**: Zero `var` declarations (`const`/`let` only) and zero loose equality operators (`===`/`!==` only).
- **Process Boundary Separation**: `extension/prefs.js` runs in the GTK4 `gnome-extensions-app` process. Neither `prefs.js` nor any module in its import chain (`tray/dbus_specs.js`, `ui/icon_style.js`, `ui/settings/gsettings.js`, `ui/settings/prefs_pages.js`) may import compositor-only typelibs (`gi://Meta`, `gi://Clutter`, `gi://St`, `gi://Shell`, `resource:///org/gnome/shell/*`).
- **Deterministic EGO Teardown**: `extension/extension.js` performs zero top-level work at import time and deterministically cleans up all `Gio.bus_own_name_on_connection` handles, `Gio.bus_watch_name_on_connection` watchers, exported D-Bus objects, `Gio.Cancellable` instances, named `GLib` timers, panel buttons, and `Shell.TrayManager` instances on `disable()`.

---

## 4. Functional Page Map

### Verification & Test Suite (`tests/` — 1 page)
- [`tests/verify.js`](tests/verify.js): Zero-dependency GJS architectural lint, Page Rule (`16..=256` lines, `<= 8` entries/dir), process-boundary check, GTK4/Libadwaita Preferences inspection, and headless behavioral test suite (`gjs -m tests/verify.js`).

### GNOME Shell Extension (`extension/` — 11 JS pages across 2 domain trees)
- **Root Entrypoints**:
  - [`extension/extension.js`](extension/extension.js): `ShoalExtension extends Extension` EGO lifecycle entrypoint.
  - [`extension/prefs.js`](extension/prefs.js): `ShoalPreferences extends ExtensionPreferences` 3-tab GTK4 / Libadwaita preferences UI.
- **StatusNotifier & Legacy Tray Engine (`extension/tray/` — 6 pages)**:
  - [`watcher.js`](extension/tray/watcher.js): `org.kde.StatusNotifierWatcher` / `org.freedesktop.StatusNotifierWatcher` D-Bus service, async `ListNames` scanner, and top-bar indicator lifecycle coordinator.
  - [`item_proxy.js`](extension/tray/item_proxy.js): Async `StatusNotifierItem` (`org.kde` / `org.ayatana` / `org.freedesktop`) property reader, signal subscriber, and click/scroll dispatcher.
  - [`panel_icon.js`](extension/tray/panel_icon.js): `ShoalPanelIcon extends PanelMenu.Button` rendering theme icons, `IconThemePath` files, or ARGB32 pixmaps with Clutter shader effects.
  - [`dbus_menu.js`](extension/tray/dbus_menu.js): Async `com.canonical.dbusmenu` client (`GetLayout`, `AboutToShow`, `Event`) and native `PopupMenu` builder.
  - [`dbus_specs.js`](extension/tray/dbus_specs.js): In-memory D-Bus XML introspection specs, SNI service address parser, and ARGB32-to-RGBA byte converter.
  - [`legacy_tray.js`](extension/tray/legacy_tray.js): `Shell.TrayManager` X11/XWayland legacy system tray wrapper.
- **UI, Styling & Settings (`extension/ui/` — 3 JS pages + stylesheet)**:
  - [`icon_style.js`](extension/ui/icon_style.js), `stylesheet.css`
  - `settings/`: [`gsettings.js`](extension/ui/settings/gsettings.js), [`prefs_pages.js`](extension/ui/settings/prefs_pages.js)

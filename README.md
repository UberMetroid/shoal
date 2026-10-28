<p align="center">
  <img src="brand/icon-160.png" width="128" height="128" alt="Shoal Icon" />
</p>

# Shoal

[![CI & EGO Bundle Verification](https://github.com/studio2201/shoal/actions/workflows/ci.yml/badge.svg)](https://github.com/studio2201/shoal/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/studio2201/shoal)](https://github.com/studio2201/shoal/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Sponsor: Tuition, Not Coffee](https://img.shields.io/badge/Sponsor-Tuition%2C%20Not%20Coffee%20%F0%9F%8E%93-2ec27e)](https://ubermetroid.github.io/tuition-not-coffee)
[![Star on GitHub](https://img.shields.io/github/stars/studio2201/shoal?style=social)](https://github.com/studio2201/shoal)

**Shoal** (`shoal@studio2201.github.io`) is a fast, zero-subprocess, Wayland-native **AppIndicator, KStatusNotifierItem (`SNI`), DBusMenu, and Legacy XWayland System Tray** extension for **GNOME Shell 45–50**. It brings crisp top-bar tray icons, native GNOME Shell popup menus, real-time monochrome/contrast Clutter shader effects, and a **3-tab Libadwaita Settings & About dialog** to your desktop.

Derived from [Ubuntu AppIndicator and KStatusNotifierItem Support](https://github.com/ubuntu/gnome-shell-extension-appindicator) (`appindicatorsupport@rgcjonas.gmail.com`) — stripped of legacy subprocess bus scanners (`tools/busAnalyzer.js`), custom pre-ES2022 promise wrappers, and constructor side effects, and engineered under the same strict [`AGENTS.md`](AGENTS.md) Page Rule and EGO standards as [**Kelp**](https://github.com/studio2201/kelp) and [**Reef**](https://github.com/studio2201/reef). Official project artwork is archived in [`brand/`](brand/) (`icon-512.png`, `icon-256.png`, `icon-160.png`, `favicon-64.png`).

> 🎓 **Support Shoal — [Tuition, Not Coffee — Help send my daughter to college](https://ubermetroid.github.io/tuition-not-coffee)** · 🌐 [**Project Website (`studio2201.github.io/shoal`)**](https://studio2201.github.io/shoal/) · ⭐ [**Star studio2201/shoal on GitHub**](https://github.com/studio2201/shoal)

---

## Designed to Pair with Kelp & Reef (and Standalone GNOME)

| Feature | Default | Why It Matters |
| :--- | :--- | :--- |
| **Zero-Subprocess D-Bus Watcher** | **Active** | Owns `org.kde.StatusNotifierWatcher` and `org.freedesktop.StatusNotifierWatcher` and scans running tray apps asynchronously via `Gio.DBus.session` — zero external `gjs` helper subprocesses (`0 shexli findings`). |
| **Universal App Packaging Support** | **Built-in** | Works out of the box with **Flatpak, Snap, AppImage, `.rpm`, `.deb`, `pacman`, Steam, Discord, Synology Drive, Nextcloud, and Electron** via `IconThemePath`, themed icon names, and ARGB32 `IconPixmap` streams. |
| **Native `com.canonical.dbusmenu`** | **Built-in** | Renders nested submenus, checkmarks, radio items, separators, and menu icons inside native GNOME Shell `PopupMenu` widgets, plus an optional **Shoal Settings & About…** shortcut. |
| **Real-Time Clutter Shader Effects** | **Configurable** | Harmonize colorful third-party tray icons with your GNOME top bar using GPU-accelerated desaturation (`0–100%`), brightness, contrast, and opacity. |
| **Mouse-Wheel & Middle-Click Actions** | **Active** | Scroll over tray icons to adjust volume/zoom (`Scroll(delta, orientation)`), left-click to activate (`Activate(x, y)`), and middle-click to trigger `SecondaryActivate(x, y)`. |

---

## Quick Install

Download `shoal@studio2201.github.io.shell-extension.zip` from [**GitHub Releases (`v1.3.0`)**](https://github.com/studio2201/shoal/releases/latest):

```bash
gnome-extensions install --force shoal@studio2201.github.io.shell-extension.zip
gnome-extensions enable shoal@studio2201.github.io
```

Open the 3-tab Libadwaita Preferences window anytime by right-clicking any tray icon and choosing **Shoal Settings & About…**, or by running:

```bash
gnome-extensions prefs shoal@studio2201.github.io
```

---

## 3-Tab Libadwaita Settings & About Window

| Tab | Controls Included |
| :--- | :--- |
| **1. Tray & Panel** | Top Bar Position (`Right Box — Near Quick Settings`, `Center Box — Near Clock`, `Left Box — Near Activities`), Top Bar Order Index (`0–10`), Compact Indicator Spacing toggle, Legacy XWayland System Tray (`Shell.TrayManager`) toggle, Middle-Click Action (`Secondary Activate`, `Open Context Menu`, `Disabled`), Scroll Wheel Forwarding toggle, Show `"Shoal Settings & About…"` in Tray Menus toggle, and **Reset to Shoal Defaults**. |
| **2. Icons & Effects** | Icon Size Override (`0 = Auto`, `16–48 px`), Icon Opacity (`64–255`), Desaturation Toward Monochrome (`0–100%`), Icon Brightness Shift (`-100%` to `+100%`), and Icon Contrast Shift (`-100%` to `+100%`). |
| **3. About & Support** | Release version (`v1.3.0`), `GPL-3.0-or-later` license & Ubuntu AppIndicator attribution, **Star Shoal on GitHub**, **Tuition, Not Coffee — Help send my daughter to college**, **Project Website**, and **Report an Issue**. |

---

## Multi-Distro & `systemd` Integration

Shoal works out of the box across **GNOME Shell 45, 46, 47, 48, 49, and 50** on **Fedora, Debian, Ubuntu, Arch Linux, openSUSE, and NixOS**:

- **`systemd-logind` Lock & Suspend Lifecycle**: Cleanly releases `org.kde.StatusNotifierWatcher` / `org.freedesktop.StatusNotifierWatcher`, unexports `/StatusNotifierWatcher`, cancels in-flight `Gio.Cancellable` D-Bus calls, and removes all panel buttons and `Shell.TrayManager` icons on screen lock (`unlock-dialog`) or disable, then re-acquires and re-scans on unlock.
- **Safe Coexistence with Pre-Installed `appindicatorsupport@rgcjonas.gmail.com`**: Uses clean D-Bus name ownership (`ALLOW_REPLACEMENT | REPLACE`) without race loops or log spam.
- **Zero Subprocesses or Telemetry**: Never spawns external processes (`GLib.spawn_*` / `Gio.Subprocess`) or makes network calls.

---

## Verification & Development

Shoal enforces strict architectural invariants (`16..=256` lines per `.js` file, `<= 200` chars per line, `<= 8` visible entries per directory, zero banned filenames, and strict process-boundary separation between `prefs.js` and compositor modules) verified by `tests/verify.js`:

```bash
xmllint --noout extension/schemas/*.xml
glib-compile-schemas --strict --dry-run extension/schemas
gjs -m tests/verify.js
gnome-extensions pack extension --force --out-dir=dist \
  --schema=schemas/org.gnome.shell.extensions.shoal.gschema.xml \
  --extra-source=tray --extra-source=ui
pipx run shexli dist/shoal@studio2201.github.io.shell-extension.zip
```

---

## 🎓 Sponsor / Support — Tuition, Not Coffee

If Shoal, Reef, and Kelp improve your daily Linux workflow, please consider supporting development:

- 🎓 **Sponsor / Donate**: [**Tuition, Not Coffee — Help send my daughter to college**](https://ubermetroid.github.io/tuition-not-coffee)
- 🌐 **Project Website**: [**studio2201.github.io/shoal**](https://studio2201.github.io/shoal/)
- ⭐ **Star on GitHub**: [**github.com/studio2201/shoal**](https://github.com/studio2201/shoal)

---

## License & Attribution

Released under the [GNU General Public License v3.0 or later](LICENSE) (`GPL-3.0-or-later`).

Derived from [Ubuntu AppIndicator and KStatusNotifierItem Support](https://github.com/ubuntu/gnome-shell-extension-appindicator) (`GPL-2.0-or-later`), Copyright (C) rgcjonas `<rgcjonas@gmail.com>`, Canonical Ltd. / Marco Trevisan `<marco.trevisan@canonical.com>`, and contributors. Redistributed under `GPL-3.0-or-later` pursuant to Section 9 of GPLv2.

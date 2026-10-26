// SPDX-License-Identifier: GPL-3.0-or-later
// Libadwaita Preferences About & Support page for Shoal.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

function add_link_row(group, title, subtitle, button_label, url, fallback_url = null) {
    const row = new Adw.ActionRow({ title, subtitle });
    const btn = new Gtk.Button({
        label: button_label,
        valign: Gtk.Align.CENTER,
        css_classes: ['pill'],
    });
    btn.connect('clicked', () => {
        let ok = false;
        try {
            ok = Boolean(Gio.AppInfo.launch_default_for_uri(url, null));
        } catch (_e) {
            ok = false;
        }
        if (!ok && fallback_url) {
            try { Gio.AppInfo.launch_default_for_uri(fallback_url, null); } catch (_e2) { /* ignore */ }
        }
    });
    row.add_suffix(btn);
    row.activatable_widget = btn;
    group.add(row);
}

export function build_about_page() {
    const page = new Adw.PreferencesPage({
        title: 'About & Support',
        icon_name: 'help-about-symbolic',
    });

    const header_group = new Adw.PreferencesGroup({
        title: 'Shoal — Wayland-Native AppIndicator &amp; System Tray for GNOME 45–50',
        description: 'Zero-subprocess KStatusNotifierItem, Ayatana AppIndicator, DBusMenu, and XWayland legacy ' +
            'system tray integration designed to pair with Kelp and Reef.',
    });

    const ver_row = new Adw.ActionRow({
        title: 'Shoal Release Version',
        subtitle: 'Zero-subprocess, zero-telemetry StatusNotifierWatcher extension for GNOME Shell',
    });
    ver_row.add_suffix(new Gtk.Label({
        label: 'v1.0.1', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(ver_row);

    const lic_row = new Adw.ActionRow({
        title: 'Open-Source License',
        subtitle: 'Derived from Ubuntu AppIndicator Support (rgcjonas, Canonical Ltd., &amp; contributors)',
    });
    lic_row.add_suffix(new Gtk.Label({
        label: 'GPL-3.0-or-later', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(lic_row);
    page.add(header_group);

    const support_group = new Adw.PreferencesGroup({
        title: 'Support &amp; Community',
        description: 'If Shoal improves your daily workflow alongside Kelp and Reef, starring the repository or ' +
            'sponsoring development helps keep GNOME 45–50 support fast and rock-solid.',
    });

    add_link_row(
        support_group,
        'Star Shoal on GitHub',
        'Star UberMetroid/shoal to help other GNOME &amp; Linux users discover Shoal',
        'Star on GitHub',
        'https://github.com/UberMetroid/shoal',
    );
    add_link_row(
        support_group,
        'Tuition, Not Coffee — Help send my daughter to college',
        "Skip the coffee — 100% of sponsorships go toward my daughter's college &amp; future fund",
        'Tuition, Not Coffee',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'https://github.com/UberMetroid/shoal',
    );
    add_link_row(
        support_group,
        'Project Website &amp; Documentation',
        'Explore the Shoal feature guide, Kelp + Reef integration overview, and configuration reference',
        'Open Website',
        'https://ubermetroid.github.io/shoal/',
    );
    add_link_row(
        support_group,
        'Report an Issue or Request a Feature',
        'Found a bug or have a feature request? Open an issue on GitHub',
        'Report Issue',
        'https://github.com/UberMetroid/shoal/issues',
    );

    page.add(support_group);
    return page;
}

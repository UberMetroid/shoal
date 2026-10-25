// SPDX-License-Identifier: GPL-3.0-or-later
// Libadwaita Preferences Custom Icons and About & Support pages for Shoal.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { remove_custom_icon, upsert_custom_icon } from './custom_icons.js';

const POPULAR_INDICATOR_PRESETS = Object.freeze([
    ['discord', 'discord-symbolic', 'user-available-symbolic'],
    ['steam', 'steam-tray-symbolic', 'folder-download-symbolic'],
    ['synology', 'network-server-symbolic', 'emblem-synchronizing-symbolic'],
    ['nextcloud', 'weather-overcast-symbolic', 'emblem-synchronizing-symbolic'],
]);

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

export function build_custom_icons_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({
        title: 'Custom Icons',
        icon_name: 'preferences-desktop-theme-symbolic',
    });

    const add_group = new Adw.PreferencesGroup({
        title: 'Add or Update Custom Icon Override',
        description: 'Map an AppIndicator ID or application title (e.g. discord, steam, synology) to theme icon names',
    });

    const id_row = new Adw.ActionRow({
        title: 'Indicator ID or App Name',
        subtitle: 'Case-insensitive substring match against StatusNotifierItem Id or Title',
    });
    const id_entry = new Gtk.Entry({
        placeholder_text: 'e.g. discord',
        valign: Gtk.Align.CENTER,
        width_chars: 18,
    });
    id_row.add_suffix(id_entry);
    add_group.add(id_row);

    const norm_row = new Adw.ActionRow({
        title: 'Normal State Icon Name',
        subtitle: 'Freedesktop icon theme name or absolute icon file path',
    });
    const norm_entry = new Gtk.Entry({
        placeholder_text: 'e.g. user-available-symbolic',
        valign: Gtk.Align.CENTER,
        width_chars: 22,
    });
    norm_row.add_suffix(norm_entry);
    add_group.add(norm_row);

    const attn_row = new Adw.ActionRow({
        title: 'Attention State Icon Name (Optional)',
        subtitle: 'Override icon used when indicator Status is NeedsAttention',
    });
    const attn_entry = new Gtk.Entry({
        placeholder_text: 'e.g. mail-unread-symbolic',
        valign: Gtk.Align.CENTER,
        width_chars: 22,
    });
    attn_row.add_suffix(attn_entry);
    add_group.add(attn_row);

    const save_row = new Adw.ActionRow({
        title: 'Save Icon Override',
        subtitle: 'Add a new override or update an existing rule with the same Indicator ID',
    });
    const save_btn = new Gtk.Button({
        label: 'Save Override',
        valign: Gtk.Align.CENTER,
        css_classes: ['suggested-action'],
    });
    save_btn.connect('clicked', () => {
        const id_txt = id_entry.get_text().trim();
        const norm_txt = norm_entry.get_text().trim();
        const attn_txt = attn_entry.get_text().trim();
        if (!id_txt || !norm_txt) return;
        const updated = upsert_custom_icon(settings.custom_icons(), id_txt, norm_txt, attn_txt);
        settings.set_custom_icons(updated);
        id_entry.set_text('');
        norm_entry.set_text('');
        attn_entry.set_text('');
    });
    save_row.add_suffix(save_btn);
    save_row.activatable_widget = save_btn;
    add_group.add(save_row);
    page.add(add_group);

    const list_group = new Adw.PreferencesGroup({
        title: 'Configured Custom Icon Overrides',
        description: 'Active icon overrides applied to matching top-bar indicators',
    });
    const active_rows = [];

    const rebuild_list = () => {
        for (const r of active_rows) list_group.remove(r);
        active_rows.length = 0;
        const entries = settings.custom_icons();
        if (entries.length === 0) {
            const empty_row = new Adw.ActionRow({
                title: 'No custom icon overrides configured',
                subtitle: 'Indicators use their native StatusNotifierItem icon theme or ARGB32 pixmap',
            });
            list_group.add(empty_row);
            active_rows.push(empty_row);
            return;
        }
        for (const [id, normal, attention] of entries) {
            const sub = attention ? `Normal: ${normal} · Attention: ${attention}` : `Normal: ${normal}`;
            const row = new Adw.ActionRow({ title: id, subtitle: sub });
            const del_btn = new Gtk.Button({
                label: 'Remove',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });
            del_btn.connect('clicked', () => {
                settings.set_custom_icons(remove_custom_icon(settings.custom_icons(), id));
            });
            row.add_suffix(del_btn);
            list_group.add(row);
            active_rows.push(row);
        }
    };
    rebuild_list();
    page.add(list_group);

    const preset_group = new Adw.PreferencesGroup({
        title: 'Quick Symbolic Icon Examples',
        description: 'One-click symbolic icon overrides for common desktop tray apps',
    });
    for (const [app_id, norm_icon, attn_icon] of POPULAR_INDICATOR_PRESETS) {
        const row = new Adw.ActionRow({
            title: `Preset: ${app_id}`,
            subtitle: `${norm_icon} (attention: ${attn_icon})`,
        });
        const btn = new Gtk.Button({ label: 'Apply Preset', valign: Gtk.Align.CENTER });
        btn.connect('clicked', () => {
            settings.set_custom_icons(upsert_custom_icon(settings.custom_icons(), app_id, norm_icon, attn_icon));
        });
        row.add_suffix(btn);
        preset_group.add(row);
    }
    page.add(preset_group);

    if (ext_settings.settings_schema?.has_key('custom-icons')) {
        signals.push([ext_settings, ext_settings.connect('changed::custom-icons', rebuild_list)]);
    }
    return page;
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
        label: 'v1.0.0', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
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

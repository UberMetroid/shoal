// SPDX-License-Identifier: GPL-3.0-or-later
// Multi-tab GTK4 / Libadwaita preferences UI for Shoal tray placement and icon effects.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { format_rgba, parse_rgba, sync_color_across_suite } from './ui/settings/color.js';
import { ExtensionSettings, MIDDLE_CLICK_ACTIONS, TRAY_POSITIONS } from './ui/settings/gsettings.js';
import { BORDER_PRESETS, build_about_page } from './ui/settings/prefs_pages.js';

function make_switch_row(title, subtitle, active, on_toggle) {
    const row = new Adw.ActionRow({ title, subtitle });
    const sw = new Gtk.Switch({ active: Boolean(active), valign: Gtk.Align.CENTER });
    sw.connect('notify::active', () => on_toggle(sw.active));
    row.add_suffix(sw);
    row.activatable_widget = sw;
    return [row, sw];
}

function make_spin_row(title, subtitle, value, min, max, step, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(value);
    spin.set_valign(Gtk.Align.CENTER);
    spin.connect('value-changed', () => on_change(spin.get_value_as_int()));
    row.add_suffix(spin);
    row.activatable_widget = spin;
    return [row, spin];
}

function make_combo_row(title, subtitle, items, active_idx, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const combo = new Gtk.ComboBoxText({ valign: Gtk.Align.CENTER });
    for (const item of items) combo.append_text(item);
    combo.set_active(Math.max(0, active_idx));
    combo.connect('changed', () => on_change(combo.get_active()));
    row.add_suffix(combo);
    row.activatable_widget = combo;
    return [row, combo];
}

function build_tray_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Tray & Panel', icon_name: 'preferences-system-symbolic' });
    const panel_group = new Adw.PreferencesGroup({
        title: 'Top Bar Placement &amp; Spacing',
        description: 'Choose where Shoal anchors application indicators in the GNOME Shell top bar',
    });
    const pos_labels = ['Right Box — Near Quick Settings (Default)', 'Center Box — Near Clock', 'Left Box — Near Activities'];
    const [pos_row, pos_combo] = make_combo_row(
        'Top Bar Position', 'Panel area where StatusNotifier and AppIndicator icons are placed',
        pos_labels, TRAY_POSITIONS.indexOf(settings.tray_pos()),
        (idx) => { if (idx >= 0 && idx < TRAY_POSITIONS.length) settings.set_tray_pos(TRAY_POSITIONS[idx]); },
    );
    const [ord_row, ord_spin] = make_spin_row(
        'Top Bar Order Index', 'Relative placement order within the chosen top-bar box (0–10)',
        settings.tray_order(), 0, 10, 1, (v) => settings.set_tray_order(v),
    );
    const [cmp_row, cmp_sw] = make_switch_row(
        'Compact Indicator Spacing', 'Tighten horizontal padding between top-bar tray icons',
        settings.compact_mode(), (v) => settings.set_compact_mode(v),
    );
    const [leg_row, leg_sw] = make_switch_row(
        'Enable Legacy XWayland System Tray', 'Embed legacy X11/XWayland system tray icons via Shell.TrayManager',
        settings.legacy_tray_enabled(), (v) => settings.set_legacy_tray_enabled(v),
    );
    for (const r of [pos_row, ord_row, cmp_row, leg_row]) panel_group.add(r);
    page.add(panel_group);

    const act_group = new Adw.PreferencesGroup({
        title: 'Mouse Actions &amp; Menu Shortcuts',
        description: 'Configure middle-click activation, scroll wheel forwarding, and menu shortcuts',
    });
    const mid_labels = [
        'Secondary Activate App Action (Default)',
        'Open Context Menu',
        'Disabled (Do Nothing)',
    ];
    const [mid_row, mid_combo] = make_combo_row(
        'Middle-Click Action', 'Behavior when middle-clicking a tray indicator in the top bar',
        mid_labels, MIDDLE_CLICK_ACTIONS.indexOf(settings.middle_click_action()),
        (idx) => {
            if (idx >= 0 && idx < MIDDLE_CLICK_ACTIONS.length) {
                settings.set_middle_click_action(MIDDLE_CLICK_ACTIONS[idx]);
            }
        },
    );
    const [scr_row, scr_sw] = make_switch_row(
        'Forward Scroll Wheel Events', 'Send mouse-wheel scroll deltas (e.g. volume or zoom) to the tray application',
        settings.scroll_enabled(), (v) => settings.set_scroll_enabled(v),
    );
    const [men_row, men_sw] = make_switch_row(
        'Show "Shoal Settings &amp; About…" in Tray Menus', 'Append a quick shortcut to open Shoal Preferences from any indicator menu',
        settings.show_settings_in_menu(), (v) => settings.set_show_settings_in_menu(v),
    );
    for (const r of [mid_row, scr_row, men_row]) act_group.add(r);

    const reset_row = new Adw.ActionRow({
        title: 'Reset to Shoal Defaults',
        subtitle: 'Restore Right Box placement, compact spacing, full-color icons, and default mouse actions',
    });
    const reset_btn = new Gtk.Button({
        label: 'Reset Defaults', valign: Gtk.Align.CENTER, css_classes: ['destructive-action', 'pill'],
    });
    reset_btn.connect('clicked', () => settings.reset_defaults());
    reset_row.add_suffix(reset_btn);
    reset_row.activatable_widget = reset_btn;
    act_group.add(reset_row);
    page.add(act_group);

    const sync_tray = () => {
        const p_idx = Math.max(0, TRAY_POSITIONS.indexOf(settings.tray_pos()));
        if (pos_combo.get_active() !== p_idx) pos_combo.set_active(p_idx);
        if (ord_spin.get_value_as_int() !== settings.tray_order()) ord_spin.set_value(settings.tray_order());
        if (cmp_sw.active !== settings.compact_mode()) cmp_sw.active = settings.compact_mode();
        if (leg_sw.active !== settings.legacy_tray_enabled()) leg_sw.active = settings.legacy_tray_enabled();
        const m_idx = Math.max(0, MIDDLE_CLICK_ACTIONS.indexOf(settings.middle_click_action()));
        if (mid_combo.get_active() !== m_idx) mid_combo.set_active(m_idx);
        if (scr_sw.active !== settings.scroll_enabled()) scr_sw.active = settings.scroll_enabled();
        if (men_sw.active !== settings.show_settings_in_menu()) men_sw.active = settings.show_settings_in_menu();
    };
    const t_keys = [
        'tray-pos', 'tray-order', 'compact-mode', 'legacy-tray-enabled',
        'middle-click-action', 'scroll-enabled', 'show-settings-in-menu',
    ];
    for (const k of t_keys) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_tray)]);
    }
    return page;
}

function build_icons_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Icons & Effects', icon_name: 'applications-graphics-symbolic' });
    const size_group = new Adw.PreferencesGroup({
        title: 'Icon Sizing &amp; Opacity',
        description: 'Control indicator dimensions and alpha blending in the GNOME top bar',
    });
    const [sz_row, sz_spin] = make_spin_row(
        'Icon Size Override (px, 0 = Auto)', 'Set 0 for automatic GNOME panel scaling, or 16–48 px for fixed size',
        settings.icon_size(), 0, 48, 2, (v) => settings.set_icon_size(v > 0 && v < 16 ? 16 : v),
    );
    const [op_row, op_spin] = make_spin_row(
        'Icon Opacity (64–255)', 'Alpha opacity for top-bar indicator icons (255 = fully opaque)',
        settings.icon_opacity(), 64, 255, 5, (v) => settings.set_icon_opacity(v),
    );
    size_group.add(sz_row);
    size_group.add(op_row);
    page.add(size_group);

    const fx_group = new Adw.PreferencesGroup({
        title: 'Monochrome Desaturation &amp; Contrast Effects',
        description: 'Apply real-time Clutter GPU shader effects to harmonize third-party app icons with your panel',
    });
    const [sat_row, sat_spin] = make_spin_row(
        'Desaturation Toward Monochrome (%)', '0% keeps original app colors; 100% renders full grayscale monochrome',
        Math.round(settings.icon_saturation() * 100), 0, 100, 5, (v) => settings.set_icon_saturation(v / 100),
    );
    const [bri_row, bri_spin] = make_spin_row(
        'Icon Brightness Shift (%)', 'Adjust indicator brightness (-100% darker to +100% brighter)',
        Math.round(settings.icon_brightness() * 100), -100, 100, 5, (v) => settings.set_icon_brightness(v / 100),
    );
    const [con_row, con_spin] = make_spin_row(
        'Icon Contrast Shift (%)', 'Adjust indicator contrast (-100% lower to +100% higher)',
        Math.round(settings.icon_contrast() * 100), -100, 100, 5, (v) => settings.set_icon_contrast(v / 100),
    );
    for (const r of [sat_row, bri_row, con_row]) fx_group.add(r);
    page.add(fx_group);

    const clr_group = new Adw.PreferencesGroup({
        title: 'Attention Accent &amp; Suite Color Sync',
        description: 'Customize the NeedsAttention indicator color and sync across all Studio 2201 extensions',
    });
    const color_row = new Adw.ActionRow({
        title: 'Attention Indicator Accent Color',
        subtitle: 'Custom RGBA color applied to symbolic indicators in NeedsAttention state',
    });
    const init_rgba = new Gdk.RGBA();
    if (!init_rgba.parse(settings.attention_color_rgba())) init_rgba.parse('rgb(255,0,0)');
    const color_btn = new Gtk.ColorButton({ rgba: init_rgba, use_alpha: true, valign: Gtk.Align.CENTER });
    color_btn.connect('color-set', () => settings.set_attention_color_rgba(color_btn.get_rgba().to_string()));
    color_row.add_suffix(color_btn);
    color_row.activatable_widget = color_btn;

    const preset_labels = [...BORDER_PRESETS.map(([label]) => label), 'Custom Color'];
    const match_preset = (color) => BORDER_PRESETS.findIndex(([, c]) => format_rgba(parse_rgba(c)) === color);
    const init_idx = match_preset(settings.attention_color_rgba());
    const [preset_row, preset_combo] = make_combo_row(
        'Quick Color Presets', 'One-click presets matching Kelp, Reef, Coral, Seabed, and Tide',
        preset_labels, init_idx >= 0 ? init_idx : BORDER_PRESETS.length,
        (idx) => {
            if (idx >= 0 && idx < BORDER_PRESETS.length) {
                const css_color = BORDER_PRESETS[idx][1];
                settings.set_attention_color_rgba(css_color);
                const next_rgba = new Gdk.RGBA();
                if (next_rgba.parse(css_color)) color_btn.set_rgba(next_rgba);
            }
        },
    );
    const sync_row = new Adw.ActionRow({
        title: 'Sync Color Across Suite',
        subtitle: 'Apply this accent color to all installed Studio 2201 extensions (Coral, Kelp, Reef, Seabed, Shoal, Tide)',
    });
    const sync_btn = new Gtk.Button({ label: 'Sync Suite Color', valign: Gtk.Align.CENTER, css_classes: ['pill'] });
    sync_btn.connect('clicked', () => {
        const count = sync_color_across_suite(settings.attention_color_rgba());
        sync_btn.set_label(`Synced (${count})`);
    });
    sync_row.add_suffix(sync_btn);
    sync_row.activatable_widget = sync_btn;
    for (const r of [color_row, preset_row, sync_row]) clr_group.add(r);
    page.add(clr_group);

    const sync_fx = () => {
        if (sz_spin.get_value_as_int() !== settings.icon_size()) sz_spin.set_value(settings.icon_size());
        if (op_spin.get_value_as_int() !== settings.icon_opacity()) op_spin.set_value(settings.icon_opacity());
        const sat_pct = Math.round(settings.icon_saturation() * 100);
        if (sat_spin.get_value_as_int() !== sat_pct) sat_spin.set_value(sat_pct);
        const bri_pct = Math.round(settings.icon_brightness() * 100);
        if (bri_spin.get_value_as_int() !== bri_pct) bri_spin.set_value(bri_pct);
        const con_pct = Math.round(settings.icon_contrast() * 100);
        if (con_spin.get_value_as_int() !== con_pct) con_spin.set_value(con_pct);
        const next_color = settings.attention_color_rgba();
        const next_rgba = new Gdk.RGBA();
        if (next_rgba.parse(next_color) && !color_btn.get_rgba().equal(next_rgba)) color_btn.set_rgba(next_rgba);
        const next_idx = match_preset(next_color);
        const target_idx = next_idx >= 0 ? next_idx : BORDER_PRESETS.length;
        if (preset_combo.get_active() !== target_idx) preset_combo.set_active(target_idx);
    };
    const f_keys = ['icon-size', 'icon-opacity', 'icon-saturation', 'icon-brightness', 'icon-contrast', 'attention-color-rgba'];
    for (const k of f_keys) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_fx)]);
    }
    return page;
}

export default class ShoalPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const ext_settings = this.getSettings();
        const settings = new ExtensionSettings(ext_settings);
        const signals = [];
        window.set_default_size(760, 680);
        window.add(build_tray_page(ext_settings, settings, signals));
        window.add(build_icons_page(ext_settings, settings, signals));
        window.add(build_about_page(this.metadata?.['version-name']));
        const cleanup = () => {
            for (const [obj, sig] of signals) obj.disconnect(sig);
            signals.length = 0;
        };
        window.connect('close-request', () => { cleanup(); return false; });
        window.connect('destroy', cleanup);
    }
}

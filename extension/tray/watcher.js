// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-subprocess StatusNotifierWatcher D-Bus server, bus scanner, and indicator manager.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { resolve_panel_box_name } from '../ui/icon_style.js';
import { ExtensionSettings } from '../ui/settings/gsettings.js';
import { WATCHER_XML, parse_sni_service } from './dbus_specs.js';
import { ItemProxy } from './item_proxy.js';
import { LegacyTray } from './legacy_tray.js';
import { ShoalPanelIcon, clear_icon_path_cache } from './panel_icon.js';

const WATCHER_PATH = '/StatusNotifierWatcher';
const WATCHER_NAMES = Object.freeze([
    'org.kde.StatusNotifierWatcher',
    'org.freedesktop.StatusNotifierWatcher',
]);
const MAX_SCAN_NAMES = 256;

export class TrayWatcher {
    constructor(extension) {
        this.extension = extension;
        this.ext_settings = extension.getSettings();
        this.settings = new ExtensionSettings(this.ext_settings);
        this.cancellable = new Gio.Cancellable();
        this._signals = [];
        this._owned_names = [];
        this._active_names = new Set();
        this._items = new Map();
        this._current_style = null;
        this.dbus_impl = null;

        this.load_theme();
        this.legacy_tray = new LegacyTray(this.settings, this.extension);
        this._export_watcher();
        this._bind_settings();
        this.legacy_tray.sync_enabled();
        this._scan_existing_bus_items();
    }

    load_theme() {
        this.unload_theme();
        try {
            const file = Gio.File.new_for_path(`${this.extension.path}/ui/stylesheet.css`);
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) {
                theme.load_stylesheet(file);
                this._current_style = file;
            }
        } catch (err) {
            console.error(err);
        }
    }

    unload_theme() {
        if (!this._current_style) return;
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) theme.unload_stylesheet(this._current_style);
        } catch (_e) { /* ignore */ }
        this._current_style = null;
    }

    _export_watcher() {
        try {
            this.dbus_impl = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, this);
            this.dbus_impl.export(Gio.DBus.session, WATCHER_PATH);
        } catch (_e) {
            this.dbus_impl = null;
        }
        for (const bus_name of WATCHER_NAMES) {
            const id = Gio.bus_own_name_on_connection(
                Gio.DBus.session, bus_name,
                Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT | Gio.BusNameOwnerFlags.REPLACE,
                () => {
                    this._active_names.add(bus_name);
                    try { this.dbus_impl?.emit_signal('StatusNotifierHostRegistered', null); } catch (_e) { /* ignore */ }
                },
                () => {
                    this._active_names.delete(bus_name);
                    if (this._active_names.size === 0) {
                        try { this.dbus_impl?.emit_signal('StatusNotifierHostUnregistered', null); } catch (_e) { /* ignore */ }
                    }
                },
            );
            this._owned_names.push(id);
        }
    }

    RegisterStatusNotifierItemAsync(params, invocation) {
        const [service] = params;
        const sender = invocation.get_sender() || '';
        const parsed = parse_sni_service(service, sender);
        if (!parsed) {
            invocation.return_dbus_error(
                'org.freedesktop.DBus.Error.InvalidArgs',
                'Invalid StatusNotifierItem service or object path',
            );
            return;
        }
        this._register_item(parsed.bus_name, parsed.obj_path);
        invocation.return_value(null);
    }

    RegisterStatusNotifierHostAsync(_params, invocation) {
        try { this.dbus_impl?.emit_signal('StatusNotifierHostRegistered', null); } catch (_e) { /* ignore */ }
        invocation.return_value(null);
    }

    get RegisteredStatusNotifierItems() { return Array.from(this._items.keys()); }
    get IsStatusNotifierHostRegistered() { return this._active_names.size > 0; }
    get ProtocolVersion() { return 0; }

    _register_item(bus_name, obj_path) {
        const key = `${bus_name}${obj_path}`;
        if (this._items.has(key)) {
            this._items.get(key).proxy._schedule_refresh();
            return;
        }
        const proxy = new ItemProxy(
            bus_name, obj_path,
            () => this._items.get(key)?.icon?.sync_from_proxy(),
            () => this._unregister_item(key),
        );
        const icon = new ShoalPanelIcon(proxy, this.settings, this.extension);
        const role = `shoal-sni-${key}`;
        const pos = resolve_panel_box_name(this.settings.tray_pos());
        try {
            Main.panel.addToStatusArea(role, icon, this.settings.tray_order() + this._items.size, pos);
        } catch (_e) {
            if (Main.panel?.statusArea) delete Main.panel.statusArea[role];
            icon.destroy();
            proxy.destroy();
            return;
        }
        const watch_id = Gio.bus_watch_name_on_connection(
            Gio.DBus.session, bus_name, Gio.BusNameWatcherFlags.NONE,
            null, () => this._unregister_item(key),
        );
        this._items.set(key, { proxy, icon, watch_id, role });
        try {
            this.dbus_impl?.emit_signal('StatusNotifierItemRegistered', new GLib.Variant('(s)', [key]));
        } catch (_e) { /* ignore */ }
    }

    _unregister_item(key) {
        const entry = this._items.get(key);
        if (!entry) return;
        this._items.delete(key);
        if (entry.watch_id) try { Gio.bus_unwatch_name(entry.watch_id); } catch (_e) { /* ignore */ }
        try { entry.icon.destroy(); } catch (_e) { /* ignore */ }
        try { entry.proxy.destroy(); } catch (_e) { /* ignore */ }
        try {
            this.dbus_impl?.emit_signal('StatusNotifierItemUnregistered', new GLib.Variant('(s)', [key]));
        } catch (_e) { /* ignore */ }
    }

    _scan_existing_bus_items() {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE, 2500, this.cancellable,
            (conn, res) => {
                try {
                    const [names] = conn.call_finish(res).deep_unpack();
                    const limit = Math.min(names.length, MAX_SCAN_NAMES * 4);
                    let registered = 0;
                    for (let i = 0; i < limit && registered < MAX_SCAN_NAMES; i += 1) {
                        const name = names[i];
                        if (name.startsWith('org.kde.StatusNotifierItem-') ||
                            name.startsWith('org.ayatana.StatusNotifierItem-')) {
                            registered += 1;
                            this._register_item(name, '/StatusNotifierItem');
                        }
                    }
                } catch (_e) { /* ignore */ }
            },
        );
    }

    _bind_settings() {
        for (const k of ['tray-pos', 'tray-order']) {
            if (this.ext_settings.settings_schema?.has_key(k)) {
                this._signals.push([this.ext_settings, this.ext_settings.connect(`changed::${k}`, () => this._relayout_icons())]);
            }
        }
        const style_keys = [
            'compact-mode', 'icon-size', 'icon-opacity', 'icon-saturation',
            'icon-brightness', 'icon-contrast', 'show-settings-in-menu', 'attention-color-rgba',
        ];
        for (const k of style_keys) {
            if (this.ext_settings.settings_schema?.has_key(k)) {
                this._signals.push([this.ext_settings, this.ext_settings.connect(`changed::${k}`, () => this._refresh_all_icons())]);
            }
        }
        if (this.ext_settings.settings_schema?.has_key('legacy-tray-enabled')) {
            this._signals.push([
                this.ext_settings,
                this.ext_settings.connect('changed::legacy-tray-enabled', () => this.legacy_tray?.sync_enabled()),
            ]);
        }
    }

    _relayout_icons() {
        const pos = resolve_panel_box_name(this.settings.tray_pos());
        const target = Main.panel[`_${pos}Box`];
        let idx = this.settings.tray_order();
        if (target) {
            for (const entry of this._items.values()) {
                const container = entry.icon.container ?? entry.icon;
                const parent = container.get_parent?.();
                if (parent === target) {
                    target.set_child_at_index(container, Math.min(idx, Math.max(0, target.get_n_children() - 1)));
                } else if (parent) {
                    parent.remove_child(container);
                    target.insert_child_at_index(container, Math.min(idx, target.get_n_children()));
                }
                idx += 1;
            }
        }
        this.legacy_tray?.relayout_icons(idx);
    }

    _refresh_all_icons() {
        for (const entry of this._items.values()) entry.icon.sync_from_proxy();
        this.legacy_tray?.refresh_style();
    }

    destroy() {
        if (this.cancellable) {
            this.cancellable.cancel();
            this.cancellable = null;
        }
        for (const [obj, sig] of this._signals) try { obj.disconnect(sig); } catch (_e) { /* ignore */ }
        this._signals.length = 0;
        for (const key of Array.from(this._items.keys())) this._unregister_item(key);
        for (const id of this._owned_names) try { Gio.bus_unown_name(id); } catch (_e) { /* ignore */ }
        this._owned_names.length = 0;
        this._active_names.clear();
        if (this.dbus_impl) {
            try { this.dbus_impl.unexport(); } catch (_e) { /* ignore */ }
            this.dbus_impl = null;
        }
        if (this.legacy_tray) {
            this.legacy_tray.destroy();
            this.legacy_tray = null;
        }
        clear_icon_path_cache();
        this.unload_theme();
        this.settings = null;
        this.ext_settings = null;
    }
}

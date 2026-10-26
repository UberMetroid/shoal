// SPDX-License-Identifier: GPL-3.0-or-later
// Async com.canonical.dbusmenu client and GNOME Shell PopupMenu tree builder.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { unpack_variant } from './dbus_specs.js';

const MAX_MENU_ITEMS = 96;

function unpack_prop(props, key, def = null) {
    return unpack_variant(props[key], def);
}

export function strip_mnemonic_underscores(label) {
    if (typeof label !== 'string' || !label) return '';
    return label.replace(/__|(^|[\s(])_([A-Za-z0-9])/g, (_m, p1, p2) => (p2 ? `${p1}${p2}` : '_'));
}

export class DBusMenuClient {
    constructor(bus_name, menu_path, popup_menu, extension, settings) {
        this.bus_name = bus_name;
        this.menu_path = menu_path;
        this.popup_menu = popup_menu;
        this.extension = extension;
        this.settings = settings;
        this.cancellable = new Gio.Cancellable();
        this._sub_ids = [];
        this._reload_timer = 0;
        this._last_layout = null;

        this._subscribe_signals();
        this.request_layout();
    }

    _subscribe_signals() {
        const conn = Gio.DBus.session;
        for (const sig of ['LayoutUpdated', 'ItemsPropertiesUpdated']) {
            const id = conn.signal_subscribe(
                this.bus_name, 'com.canonical.dbusmenu', sig,
                this.menu_path, null, Gio.DBusSignalFlags.NONE, () => this._schedule_reload(),
            );
            this._sub_ids.push(id);
        }
    }

    _schedule_reload() {
        if (this._reload_timer !== 0 || !this.cancellable || this.cancellable.is_cancelled()) return;
        this._reload_timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._reload_timer = 0;
            this.request_layout();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._reload_timer, '[shoal] dbusmenu-reload');
    }

    about_to_show(item_id = 0) {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        Gio.DBus.session.call(
            this.bus_name, this.menu_path, 'com.canonical.dbusmenu', 'AboutToShow',
            new GLib.Variant('(i)', [item_id]), new GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE, 1500, this.cancellable,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const [need_update] = reply.deep_unpack();
                    if (need_update) this.request_layout();
                } catch (_e) {
                    this.request_layout();
                }
            },
        );
    }

    request_layout() {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        Gio.DBus.session.call(
            this.bus_name, this.menu_path, 'com.canonical.dbusmenu', 'GetLayout',
            new GLib.Variant('(iias)', [0, -1, []]), new GLib.VariantType('(u(ia{sv}av))'),
            Gio.DBusCallFlags.NONE, 2500, this.cancellable,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const [, root_layout] = reply.unpack();
                    this._last_layout = root_layout;
                    this.rebuild_popup_menu();
                } catch (_e) {
                    if (!this._last_layout) this.rebuild_popup_menu();
                }
            },
        );
    }

    send_event(item_id, event_id = 'clicked') {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        const ts = Math.floor(GLib.get_monotonic_time() / 1000) >>> 0;
        Gio.DBus.session.call(
            this.bus_name, this.menu_path, 'com.canonical.dbusmenu', 'Event',
            new GLib.Variant('(isvu)', [item_id, event_id, new GLib.Variant('i', 0), ts]),
            null, Gio.DBusCallFlags.NONE, 1500, this.cancellable,
            (conn, res) => {
                try { conn.call_finish(res); } catch (_e) { /* ignore */ }
            },
        );
    }

    rebuild_popup_menu() {
        if (!this.popup_menu) return;
        this.popup_menu.removeAll();
        let count = 0;

        if (this._last_layout) {
            const [, , root_children_var] = this._last_layout.unpack();
            const children = root_children_var.unpack();
            for (const child_v of children) {
                if (count >= MAX_MENU_ITEMS) break;
                const node = child_v.unpack();
                count = this._append_node(this.popup_menu, node, count, 0);
            }
        }

        if (this.settings?.show_settings_in_menu()) {
            if (count > 0) this.popup_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const prefs_item = new PopupMenu.PopupMenuItem('Shoal Settings & About…');
            prefs_item.connect('activate', () => {
                try { this.extension?.openPreferences(); } catch (_e) { /* ignore */ }
            });
            this.popup_menu.addMenuItem(prefs_item);
        }
    }

    _append_node(target_menu, node_variant, count, depth) {
        if (count >= MAX_MENU_ITEMS || depth > 3) return count;
        const [id_v, props_v, children_v] = node_variant.unpack();
        const item_id = id_v.deep_unpack();
        const props = props_v.unpack();

        if (unpack_prop(props, 'visible', true) === false) return count;
        const item_type = unpack_prop(props, 'type', 'standard');
        if (item_type === 'separator') {
            target_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            return count + 1;
        }

        const raw_label = unpack_prop(props, 'label', '');
        const label = strip_mnemonic_underscores(raw_label);
        const enabled = unpack_prop(props, 'enabled', true) !== false;
        const toggle_type = unpack_prop(props, 'toggle-type', '');
        const toggle_state = unpack_prop(props, 'toggle-state', 0);
        const icon_name = unpack_prop(props, 'icon-name', '');
        const children_Display = unpack_prop(props, 'children-display', '');
        const sub_nodes = children_v.unpack();

        if ((children_Display === 'submenu' || sub_nodes.length > 0) && depth < 3) {
            const sub_item = new PopupMenu.PopupSubMenuMenuItem(label || 'Submenu');
            sub_item.setSensitive(enabled);
            sub_item.menu.connect('open-state-changed', (_m, is_open) => {
                if (is_open) this.about_to_show(item_id);
            });
            let next_count = count + 1;
            for (const sub_v of sub_nodes) {
                if (next_count >= MAX_MENU_ITEMS) break;
                next_count = this._append_node(sub_item.menu, sub_v.unpack(), next_count, depth + 1);
            }
            target_menu.addMenuItem(sub_item);
            return next_count;
        }

        if (!label && !icon_name) return count;
        const menu_item = new PopupMenu.PopupMenuItem(label);
        menu_item.setSensitive(enabled);
        if (toggle_type === 'checkmark') {
            menu_item.setOrnament(toggle_state === 1 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        } else if (toggle_type === 'radio') {
            menu_item.setOrnament(toggle_state === 1 ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        if (icon_name) {
            const icon = new St.Icon({ icon_name, style_class: 'popup-menu-icon' });
            menu_item.insert_child_at_index(icon, 1);
        }
        menu_item.connect('activate', () => this.send_event(item_id, 'clicked'));
        target_menu.addMenuItem(menu_item);
        return count + 1;
    }

    destroy() {
        if (this._reload_timer !== 0) {
            GLib.Source.remove(this._reload_timer);
            this._reload_timer = 0;
        }
        if (this.cancellable) {
            this.cancellable.cancel();
            this.cancellable = null;
        }
        for (const id of this._sub_ids) {
            try { Gio.DBus.session.signal_unsubscribe(id); } catch (_e) { /* ignore */ }
        }
        this._sub_ids.length = 0;
        this._last_layout = null;
        this.popup_menu = null;
    }
}

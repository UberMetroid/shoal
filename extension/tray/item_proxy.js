// SPDX-License-Identifier: GPL-3.0-or-later
// Async StatusNotifierItem D-Bus client (ItemProxy) managing properties, signals, and actions.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { unpack_variant } from './dbus_specs.js';

const SNI_IFACES = Object.freeze([
    'org.kde.StatusNotifierItem',
    'org.ayatana.StatusNotifierItem',
    'org.freedesktop.StatusNotifierItem',
]);

const SIGNAL_NAMES = Object.freeze([
    'NewIcon',
    'NewAttentionIcon',
    'NewOverlayIcon',
    'NewTitle',
    'NewToolTip',
    'NewStatus',
    'XAyatanaNewLabel',
]);

function unpack_str(dict, key, fallback = '') {
    const s = unpack_variant(dict[key]);
    return typeof s === 'string' ? s : fallback;
}

function unpack_bool(dict, key, fallback = false) {
    const b = unpack_variant(dict[key]);
    return b === null ? fallback : Boolean(b);
}

function unpack_pixmaps(dict, key) {
    const arr = unpack_variant(dict[key]);
    return Array.isArray(arr) ? arr : [];
}

export class ItemProxy {
    constructor(bus_name, obj_path, on_update, on_invalid = null) {
        this.bus_name = bus_name;
        this.obj_path = obj_path;
        this.key = `${bus_name}${obj_path}`;
        this.on_update = on_update;
        this.on_invalid = on_invalid;
        this.iface_name = 'org.kde.StatusNotifierItem';
        this.cancellable = new Gio.Cancellable();
        this._sub_ids = [];
        this._refresh_timer = 0;
        this._has_loaded = false;

        this.id = '';
        this.title = '';
        this.status = 'Active';
        this.category = 'ApplicationStatus';
        this.icon_name = '';
        this.attention_icon_name = '';
        this.overlay_icon_name = '';
        this.icon_theme_path = '';
        this.label = '';
        this.menu_path = '';
        this.item_is_menu = false;
        this.icon_pixmap = [];
        this.attention_icon_pixmap = [];
        this.tooltip_title = '';

        this._subscribe_signals();
        this.refresh_properties();
    }

    _subscribe_signals() {
        const conn = Gio.DBus.session;
        for (const sig of SIGNAL_NAMES) {
            const id = conn.signal_subscribe(
                this.bus_name, null, sig, this.obj_path, null,
                Gio.DBusSignalFlags.NONE, () => this._schedule_refresh(),
            );
            this._sub_ids.push(id);
        }
        const prop_id = conn.signal_subscribe(
            this.bus_name, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
            this.obj_path, null, Gio.DBusSignalFlags.NONE, () => this._schedule_refresh(),
        );
        this._sub_ids.push(prop_id);
    }

    _schedule_refresh() {
        if (this._refresh_timer !== 0 || !this.cancellable || this.cancellable.is_cancelled()) return;
        this._refresh_timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            this._refresh_timer = 0;
            this.refresh_properties();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._refresh_timer, '[shoal] sni-refresh');
    }

    refresh_properties(iface_idx = 0) {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        const candidate = SNI_IFACES[iface_idx] || SNI_IFACES[0];
        Gio.DBus.session.call(
            this.bus_name,
            this.obj_path,
            'org.freedesktop.DBus.Properties',
            'GetAll',
            new GLib.Variant('(s)', [candidate]),
            new GLib.VariantType('(a{sv})'),
            Gio.DBusCallFlags.NONE,
            2500,
            this.cancellable,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const [dict] = reply.unpack();
                    const props = dict.deep_unpack();
                    this.iface_name = candidate;
                    this._has_loaded = true;
                    this._apply_props(props);
                } catch (_e) {
                    if (iface_idx + 1 < SNI_IFACES.length) {
                        this.refresh_properties(iface_idx + 1);
                    } else if (!this._has_loaded && typeof this.on_invalid === 'function') {
                        this.on_invalid();
                    }
                }
            },
        );
    }

    _apply_props(props) {
        this.id = unpack_str(props, 'Id', this.id || this.bus_name);
        this.title = unpack_str(props, 'Title', this.title || this.id);
        this.status = unpack_str(props, 'Status', 'Active');
        this.category = unpack_str(props, 'Category', 'ApplicationStatus');
        this.icon_name = unpack_str(props, 'IconName', '');
        this.attention_icon_name = unpack_str(props, 'AttentionIconName', '');
        this.overlay_icon_name = unpack_str(props, 'OverlayIconName', '');
        this.icon_theme_path = unpack_str(props, 'IconThemePath', '');
        this.label = unpack_str(props, 'XAyatanaLabel', '');
        this.menu_path = unpack_str(props, 'Menu', '');
        this.item_is_menu = unpack_bool(props, 'ItemIsMenu', false);
        this.icon_pixmap = unpack_pixmaps(props, 'IconPixmap');
        this.attention_icon_pixmap = unpack_pixmaps(props, 'AttentionIconPixmap');
        const tt = unpack_variant(props.ToolTip);
        if (Array.isArray(tt) && tt.length >= 3 && typeof tt[2] === 'string') {
            this.tooltip_title = tt[2];
        }
        if (typeof this.on_update === 'function') this.on_update(this);
    }

    call_action(method, params_variant, on_error = null) {
        if (!this.cancellable || this.cancellable.is_cancelled()) return;
        Gio.DBus.session.call(
            this.bus_name, this.obj_path, this.iface_name, method,
            params_variant, null, Gio.DBusCallFlags.NONE, 1500, this.cancellable,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (_e) {
                    if (typeof on_error === 'function') on_error();
                }
            },
        );
    }

    activate(x = 0, y = 0, on_fallback = null) {
        this.call_action('Activate', new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]), on_fallback);
    }

    secondary_activate(x = 0, y = 0) {
        const ts = Math.floor(GLib.get_monotonic_time() / 1000) >>> 0;
        this.call_action('SecondaryActivate', new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]), () => {
            this.call_action('XAyatanaSecondaryActivate', new GLib.Variant('(u)', [ts]));
        });
    }

    context_menu(x = 0, y = 0) {
        this.call_action('ContextMenu', new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]));
    }

    scroll(delta, orientation = 'vertical') {
        const d = Math.round(Number(delta) || 0);
        if (d === 0) return;
        this.call_action('Scroll', new GLib.Variant('(is)', [d, orientation]));
    }

    destroy() {
        if (this._refresh_timer !== 0) {
            GLib.Source.remove(this._refresh_timer);
            this._refresh_timer = 0;
        }
        if (this.cancellable) {
            this.cancellable.cancel();
            this.cancellable = null;
        }
        for (const id of this._sub_ids) {
            try { Gio.DBus.session.signal_unsubscribe(id); } catch (_e) { /* ignore */ }
        }
        this._sub_ids.length = 0;
        this.on_update = null;
        this.on_invalid = null;
    }
}

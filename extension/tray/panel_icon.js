// SPDX-License-Identifier: GPL-3.0-or-later
// Top-bar StatusNotifier indicator button (ShoalPanelIcon) with pixbuf, effects, and actions.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
    build_icon_inline_style, compute_effect_params,
    compute_effective_icon_size, compute_icon_opacity,
} from '../ui/icon_style.js';
import { DBusMenuClient } from './dbus_menu.js';
import { argb32_to_rgba, select_best_pixmap } from './dbus_specs.js';

const ICON_EXTS = Object.freeze(['', '.svg', '.png', '.xpm']);
const ICON_SUBDIRS = Object.freeze([
    '', 'hicolor/scalable/apps', 'hicolor/symbolic/apps',
    'hicolor/48x48/apps', 'hicolor/32x32/apps', 'hicolor/24x24/apps', 'hicolor/16x16/apps',
]);
const MAX_PATH_CACHE = 128;
const PATH_CACHE = new Map();

export function clear_icon_path_cache() {
    PATH_CACHE.clear();
}

function find_theme_file(theme_path, icon_name) {
    if (!icon_name) return null;
    const cache_key = `${theme_path || ''}\0${icon_name}`;
    if (PATH_CACHE.has(cache_key)) return PATH_CACHE.get(cache_key);
    let found = null;
    if (icon_name.startsWith('/')) {
        if (GLib.file_test(icon_name, GLib.FileTest.IS_REGULAR)) found = Gio.File.new_for_path(icon_name);
    } else if (theme_path) {
        outer: for (const sub of ICON_SUBDIRS) {
            for (const ext of ICON_EXTS) {
                const full = sub ? GLib.build_filenamev([theme_path, sub, `${icon_name}${ext}`]) : GLib.build_filenamev([theme_path, `${icon_name}${ext}`]);
                if (GLib.file_test(full, GLib.FileTest.IS_REGULAR)) {
                    found = Gio.File.new_for_path(full);
                    break outer;
                }
            }
        }
    }
    if (found) {
        if (PATH_CACHE.size >= MAX_PATH_CACHE) PATH_CACHE.clear();
        PATH_CACHE.set(cache_key, found);
    }
    return found;
}

export const ShoalPanelIcon = GObject.registerClass(
class ShoalPanelIcon extends PanelMenu.Button {
    _init(proxy, settings, extension) {
        super._init(0.5, proxy.title || proxy.id || 'Shoal Indicator', false);
        this.proxy = proxy;
        this.settings = settings;
        this.extension = extension;
        this.dbus_menu = null;
        this._desat_fx = null;
        this._bc_fx = null;
        this._icon_key = '';
        this._last_show_prefs = null;

        this.add_style_class_name('shoal-indicator');
        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box shoal-indicator-box' });
        this._icon = new St.Icon({
            style_class: 'system-status-icon shoal-indicator-icon',
            fallback_icon_name: 'application-x-executable-symbolic',
        });
        this._label = new St.Label({
            style_class: 'shoal-indicator-label', y_align: Clutter.ActorAlign.CENTER, visible: false,
        });
        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._evt_id = this.connect('event', (_actor, event) => this._on_event(event));
        this._menu_id = this.menu.connect('open-state-changed', (_menu, is_open) => {
            if (is_open && this.dbus_menu) this.dbus_menu.about_to_show(0);
        });
        this.sync_from_proxy();
    }

    sync_from_proxy() {
        if (!this.proxy || !this.settings) return;
        const status = this.proxy.status || 'Active';
        this.visible = status !== 'Passive';
        const is_attn = status === 'NeedsAttention';

        if (this.settings.compact_mode()) this.add_style_class_name('shoal-indicator-compact');
        else this.remove_style_class_name('shoal-indicator-compact');
        if (is_attn) this.add_style_class_name('shoal-indicator-attention');
        else this.remove_style_class_name('shoal-indicator-attention');

        this.accessible_name = this.proxy.tooltip_title || this.proxy.title || this.proxy.id || 'Shoal Indicator';
        const lbl = this.proxy.label || '';
        this._label.text = lbl;
        this._label.visible = lbl.length > 0;

        this._update_icon_gicon(is_attn);
        this.apply_visual_style(is_attn);
        this._sync_dbus_menu();
    }

    _update_icon_gicon(is_attn) {
        const size = compute_effective_icon_size(this.settings.icon_size());
        const wanted = is_attn && this.proxy.attention_icon_name ? this.proxy.attention_icon_name : this.proxy.icon_name;

        if (wanted) {
            const theme_file = find_theme_file(this.proxy.icon_theme_path, wanted);
            const key = `named:${this.proxy.icon_theme_path}:${wanted}:${theme_file ? 1 : 0}`;
            if (this._icon_key === key) return;
            this._icon_key = key;
            this._icon.gicon = theme_file ? new Gio.FileIcon({ file: theme_file }) : new Gio.ThemedIcon({ name: wanted });
            return;
        }

        const pixmaps = is_attn && this.proxy.attention_icon_pixmap.length > 0
            ? this.proxy.attention_icon_pixmap : this.proxy.icon_pixmap;
        const best = select_best_pixmap(pixmaps, size);
        if (best) {
            try {
                let hash = 2166136261;
                const b = best.bytes, blen = b.length ?? b.byteLength ?? 0, step = Math.max(1, blen >> 8);
                for (let i = 0; i < blen; i += step) hash = Math.imul(hash ^ b[i], 16777619) >>> 0;
                const px_key = `px:${is_attn ? 1 : 0}:${best.width}x${best.height}:${hash}`;
                if (this._icon_key === px_key) return;
                const rgba = argb32_to_rgba(best.bytes, best.width * best.height);
                const content = St.ImageContent.new_with_preferred_size(best.width, best.height);
                const gbytes = GLib.Bytes.new(rgba), fmt = Cogl.PixelFormat.RGBA_8888_PRE ?? Cogl.PixelFormat.RGBA_8888;
                if (content.set_bytes.length >= 6) {
                    const cogl_ctx = global.stage.context.get_backend().get_cogl_context();
                    content.set_bytes(cogl_ctx, gbytes, fmt, best.width, best.height, best.width * 4);
                } else content.set_bytes(gbytes, fmt, best.width, best.height, best.width * 4);
                this._icon_key = px_key;
                this._icon.gicon = content;
                return;
            } catch (_e) { /* fall back to symbolic icon */ }
        }
        this._icon_key = 'fallback';
        this._icon.icon_name = 'application-x-executable-symbolic';
    }

    apply_visual_style(is_attn = (this.proxy?.status === 'NeedsAttention')) {
        if (!this.settings || !this._icon) return;
        this._icon.icon_size = compute_effective_icon_size(this.settings.icon_size());
        this._icon.style = build_icon_inline_style(this.settings.icon_size(), is_attn, this.settings.attention_color_rgba());
        this._icon.opacity = compute_icon_opacity(this.settings.icon_opacity());
        const fx = compute_effect_params(
            this.settings.icon_saturation(), this.settings.icon_brightness(), this.settings.icon_contrast(),
        );
        if (fx.has_desaturate) {
            if (!this._desat_fx) {
                this._desat_fx = new Clutter.DesaturateEffect({ factor: fx.desaturate });
                this._icon.add_effect_with_name('shoal-desaturate', this._desat_fx);
            } else this._desat_fx.set_factor(fx.desaturate);
        } else if (this._desat_fx) {
            this._icon.remove_effect_by_name('shoal-desaturate');
            this._desat_fx = null;
        }
        if (fx.has_brightness_contrast) {
            if (!this._bc_fx) {
                this._bc_fx = new Clutter.BrightnessContrastEffect();
                this._icon.add_effect_with_name('shoal-bc', this._bc_fx);
            }
            this._bc_fx.set_brightness(fx.brightness);
            this._bc_fx.set_contrast(fx.contrast);
        } else if (this._bc_fx) {
            this._icon.remove_effect_by_name('shoal-bc');
            this._bc_fx = null;
        }
    }

    _sync_dbus_menu() {
        const path = this.proxy.menu_path, show_prefs = this.settings.show_settings_in_menu();
        const prefs_changed = this._last_show_prefs !== show_prefs;
        this._last_show_prefs = show_prefs;
        if (path && path !== '/') {
            if (!this.dbus_menu || this.dbus_menu.menu_path !== path) {
                if (this.dbus_menu) this.dbus_menu.destroy();
                this.dbus_menu = new DBusMenuClient(this.proxy.bus_name, path, this.menu, this.extension, this.settings);
            } else if (prefs_changed) this.dbus_menu.rebuild_popup_menu();
            return;
        }
        const had_dbus_menu = Boolean(this.dbus_menu);
        if (this.dbus_menu) { this.dbus_menu.destroy(); this.dbus_menu = null; }
        if (!had_dbus_menu && !prefs_changed) return;
        this.menu.removeAll();
        if (show_prefs) {
            const prefs_item = new PopupMenu.PopupMenuItem('Shoal Settings & About…');
            prefs_item.connect('activate', () => { try { this.extension?.openPreferences(); } catch (_e) { /* ignore */ } });
            this.menu.addMenuItem(prefs_item);
        }
    }

    _on_event(event) {
        const etype = event.type();
        if (etype === Clutter.EventType.SCROLL) {
            if (!this.settings.scroll_enabled()) return Clutter.EVENT_PROPAGATE;
            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP) this.proxy.scroll(120, 'vertical');
            else if (dir === Clutter.ScrollDirection.DOWN) this.proxy.scroll(-120, 'vertical');
            else if (dir === Clutter.ScrollDirection.LEFT) this.proxy.scroll(-120, 'horizontal');
            else if (dir === Clutter.ScrollDirection.RIGHT) this.proxy.scroll(120, 'horizontal');
            else if (dir === Clutter.ScrollDirection.SMOOTH) {
                const [dx, dy] = event.get_scroll_delta();
                if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > 0.05) this.proxy.scroll(-dy * 120, 'vertical');
                else if (Math.abs(dx) > 0.05) this.proxy.scroll(dx * 120, 'horizontal');
            } else return Clutter.EVENT_PROPAGATE;
            return Clutter.EVENT_STOP;
        }
        if (etype !== Clutter.EventType.BUTTON_PRESS && etype !== Clutter.EventType.TOUCH_BEGIN) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const button = etype === Clutter.EventType.BUTTON_PRESS ? event.get_button() : 1;

        if (button === 1) {
            if (this.proxy.item_is_menu || (this.proxy._has_loaded && !this.proxy.id && this.dbus_menu)) this.menu.toggle();
            else {
                this.menu.close();
                this.proxy.activate(x, y, () => (this.dbus_menu ? this.menu.open() : this.proxy?.context_menu(x, y)));
            }
            return Clutter.EVENT_STOP;
        }
        if (button === 2) {
            const mid = this.settings.middle_click_action();
            if (mid === 'secondary-activate') this.proxy.secondary_activate(x, y);
            else if (mid === 'open-menu') this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        if (button === 3) {
            if (this.dbus_menu || this.settings.show_settings_in_menu()) this.menu.toggle();
            else this.proxy.context_menu(x, y);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        if (this._evt_id) try { this.disconnect(this._evt_id); } catch (_e) { /* ignore */ }
        if (this._menu_id && this.menu) try { this.menu.disconnect(this._menu_id); } catch (_e) { /* ignore */ }
        this._evt_id = 0;
        this._menu_id = 0;
        if (this.dbus_menu) { this.dbus_menu.destroy(); this.dbus_menu = null; }
        this._desat_fx = null;
        this._bc_fx = null;
        this.proxy = null;
        this.settings = null;
        this.extension = null;
        super.destroy();
    }
});

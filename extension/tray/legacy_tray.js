// SPDX-License-Identifier: GPL-3.0-or-later
// Legacy X11/XWayland system tray wrapper (LegacyTray) around Shell.TrayManager.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { compute_effective_icon_size, compute_icon_opacity, resolve_panel_box_name } from '../ui/icon_style.js';

export class LegacyTray {
    constructor(settings, extension) {
        this.settings = settings;
        this.extension = extension;
        this.tray_manager = null;
        this._signals = [];
        this._buttons = new Map();
    }

    sync_enabled() {
        if (this.settings.legacy_tray_enabled()) {
            this.enable();
        } else {
            this.disable();
        }
    }

    enable() {
        if (this.tray_manager !== null) return;
        if (typeof Shell.TrayManager !== 'function') return;
        try {
            const mgr = new Shell.TrayManager();
            this._signals.push(
                mgr.connect('tray-icon-added', (_mgr, icon) => this._on_icon_added(icon)),
                mgr.connect('tray-icon-removed', (_mgr, icon) => this._on_icon_removed(icon)),
            );
            mgr.manage_screen(Main.panel);
            this.tray_manager = mgr;
        } catch (_e) {
            this._signals.length = 0;
            this.tray_manager = null;
        }
    }

    _on_icon_added(tray_icon) {
        if (!tray_icon || this._buttons.has(tray_icon)) return;
        const size = compute_effective_icon_size(this.settings.icon_size());
        tray_icon.set_size?.(size, size);
        tray_icon.reactive = true;
        tray_icon.opacity = compute_icon_opacity(this.settings.icon_opacity());
        if (typeof tray_icon.set_x_align === 'function') {
            tray_icon.set_x_align(Clutter.ActorAlign.CENTER);
            tray_icon.set_y_align(Clutter.ActorAlign.CENTER);
        }

        const btn = new PanelMenu.Button(0.5, 'Shoal Legacy Tray Icon', false);
        btn.add_style_class_name('shoal-indicator');
        btn.add_style_class_name('shoal-legacy-tray-icon');
        if (this.settings.compact_mode()) btn.add_style_class_name('shoal-indicator-compact');

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box shoal-indicator-box' });
        box.add_child(tray_icon);
        btn.add_child(box);

        if (this.settings.show_settings_in_menu()) {
            const prefs_item = new PopupMenu.PopupMenuItem('Shoal Settings & About…');
            prefs_item.connect('activate', () => {
                try { this.extension?.openPreferences(); } catch (_e) { /* ignore */ }
            });
            btn.menu.addMenuItem(prefs_item);
        }

        const role = `shoal-legacy-${Date.now()}-${this._buttons.size}`;
        const pos = resolve_panel_box_name(this.settings.tray_pos());
        const order = this.settings.tray_order();
        try {
            Main.panel.addToStatusArea(role, btn, order, pos);
            tray_icon.connect?.('destroy', () => this._on_icon_removed(tray_icon));
            this._buttons.set(tray_icon, btn);
        } catch (_e) {
            btn.destroy();
        }
    }

    _on_icon_removed(tray_icon) {
        const btn = this._buttons.get(tray_icon);
        if (!btn) return;
        this._buttons.delete(tray_icon);
        try { btn.destroy(); } catch (_e) { /* ignore */ }
    }

    refresh_style() {
        const size = compute_effective_icon_size(this.settings.icon_size());
        const opacity = compute_icon_opacity(this.settings.icon_opacity());
        const compact = this.settings.compact_mode();
        for (const [icon, btn] of this._buttons.entries()) {
            try {
                icon.set_size?.(size, size);
                icon.opacity = opacity;
                if (compact) btn.add_style_class_name('shoal-indicator-compact');
                else btn.remove_style_class_name('shoal-indicator-compact');
            } catch (_e) { /* ignore */ }
        }
    }

    disable() {
        for (const btn of this._buttons.values()) {
            try { btn.destroy(); } catch (_e) { /* ignore */ }
        }
        this._buttons.clear();
        if (this.tray_manager !== null) {
            for (const id of this._signals) {
                try { this.tray_manager.disconnect(id); } catch (_e) { /* ignore */ }
            }
            this._signals.length = 0;
            try { this.tray_manager.unmanage_screen(); } catch (_e) { /* ignore */ }
            this.tray_manager = null;
        }
    }

    destroy() {
        this.disable();
        this.settings = null;
        this.extension = null;
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Typed wrapper (ExtensionSettings) around Shoal GSettings schema keys and defaults.

export const TRAY_POSITIONS = Object.freeze(['right', 'center', 'left']);
export const MIDDLE_CLICK_ACTIONS = Object.freeze(['secondary-activate', 'open-menu', 'none']);

const BOOL_KEYS = Object.freeze([
    'compact-mode',
    'legacy-tray-enabled',
    'scroll-enabled',
    'show-settings-in-menu',
]);

const UINT_BOUNDS = Object.freeze({
    'tray-order': [0, 10, 1],
    'icon-size': [0, 48, 0],
    'icon-opacity': [64, 255, 255],
});

const DOUBLE_BOUNDS = Object.freeze({
    'icon-saturation': [0.0, 1.0, 0.0],
    'icon-brightness': [-1.0, 1.0, 0.0],
    'icon-contrast': [-1.0, 1.0, 0.0],
});

const ENUM_SPEC = Object.freeze({
    'tray-pos': [TRAY_POSITIONS, 'right'],
    'middle-click-action': [MIDDLE_CLICK_ACTIONS, 'secondary-activate'],
});

export class ExtensionSettings {
    constructor(ext_settings) {
        this.ext = ext_settings;

        for (const key of BOOL_KEYS) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => (this.ext.settings_schema?.has_key(key) ? this.ext.get_boolean(key) : true);
            this[`set_${prop}`] = (v) => {
                if (this.ext.settings_schema?.has_key(key)) this.ext.set_boolean(key, Boolean(v));
            };
        }

        for (const [key, [min, max, def]] of Object.entries(UINT_BOUNDS)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => {
                if (!this.ext.settings_schema?.has_key(key)) return def;
                const raw = this.ext.get_uint(key);
                if (key === 'icon-size' && raw > 0 && raw < 16) return 16;
                return Math.max(min, Math.min(max, raw));
            };
            this[`set_${prop}`] = (v) => {
                if (!this.ext.settings_schema?.has_key(key)) return;
                let n = Math.round(Number(v) || 0);
                if (key === 'icon-size' && n > 0 && n < 16) n = 16;
                const clamped = Math.max(min, Math.min(max, n));
                this.ext.set_uint(key, clamped);
            };
        }

        for (const [key, [min, max, def]] of Object.entries(DOUBLE_BOUNDS)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => {
                if (!this.ext.settings_schema?.has_key(key)) return def;
                const raw = this.ext.get_double(key);
                return Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : def));
            };
            this[`set_${prop}`] = (v) => {
                if (!this.ext.settings_schema?.has_key(key)) return;
                const num = Number(v);
                const clamped = Math.max(min, Math.min(max, Number.isFinite(num) ? num : def));
                this.ext.set_double(key, Math.round(clamped * 100) / 100);
            };
        }

        for (const [key, [allowed, def]] of Object.entries(ENUM_SPEC)) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => {
                if (!this.ext.settings_schema?.has_key(key)) return def;
                const raw = this.ext.get_string(key);
                return allowed.includes(raw) ? raw : def;
            };
            this[`set_${prop}`] = (v) => {
                if (!this.ext.settings_schema?.has_key(key)) return;
                const valid = allowed.includes(v) ? v : def;
                if (this.ext.get_string(key) !== valid) this.ext.set_string(key, valid);
            };
        }
    }

    reset_defaults() {
        this.set_tray_pos('right');
        this.set_tray_order(1);
        this.set_compact_mode(true);
        this.set_icon_size(0);
        this.set_icon_opacity(255);
        this.set_icon_saturation(0.0);
        this.set_icon_brightness(0.0);
        this.set_icon_contrast(0.0);
        this.set_legacy_tray_enabled(true);
        this.set_middle_click_action('secondary-activate');
        this.set_scroll_enabled(true);
        this.set_show_settings_in_menu(true);
    }
}

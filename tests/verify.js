// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-dependency GJS architectural lint, Page Rule, EGO boundary, GTK4/Adw, and behavioral test suite.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { WATCHER_XML, argb32_to_rgba, parse_sni_service, select_best_pixmap, unpack_variant } from '../extension/tray/dbus_specs.js';
import {
    DEFAULT_PANEL_ICON_SIZE, build_icon_inline_style, build_indicator_style_classes,
    compute_effect_params, compute_effective_icon_size, compute_icon_opacity, resolve_panel_box_name,
} from '../extension/ui/icon_style.js';
import { ExtensionSettings, MIDDLE_CLICK_ACTIONS, TRAY_POSITIONS } from '../extension/ui/settings/gsettings.js';
import { build_about_page } from '../extension/ui/settings/prefs_pages.js';

const BANNED_STEMS = new Set([
    'util', 'utils', 'lib', 'helper', 'helpers', 'common', 'misc', 'shared', 'base', 'core', 'types', 'mod',
]);
const DECODER = new TextDecoder('utf-8');
const REPO_ROOT = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const EXT_ROOT = GLib.build_filenamev([REPO_ROOT, 'extension']);

function assert(cond, msg) {
    if (!cond) throw new Error(`Verification failed: ${msg}`);
}

function read_text(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, `failed to read ${path}`);
    return DECODER.decode(bytes);
}

function walk_repo(dir_path, js_files, dirs) {
    dirs.push(dir_path);
    const enumerator = Gio.File.new_for_path(dir_path).enumerate_children(
        'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null,
    );
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        if (name.startsWith('.') || name === 'dist' || name === 'target') continue;
        const full = GLib.build_filenamev([dir_path, name]);
        if (info.get_file_type() === Gio.FileType.DIRECTORY) walk_repo(full, js_files, dirs);
        else if (name.endsWith('.js')) js_files.push(full);
    }
    enumerator.close(null);
}

function strip_strings_and_line_comment(raw) {
    let out = '', quote = '';
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (quote) {
            if (ch === '\\') i += 1;
            else if (ch === quote) quote = '';
        } else if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            out += '""';
        } else if (ch === '/' && raw[i + 1] === '/') break;
        else out += ch;
    }
    return out;
}

function verify_page_rules_and_lint(js_files, dirs) {
    assert(js_files.length === 12, `expected 12 .js files, found ${js_files.length}`);
    const legacy = [
        'imports.gi', 'imports.ui', 'imports.misc', 'ExtensionUtils',
        'Meta.LaterType', 'Clutter.Container', 'add_actor', 'remove_actor',
    ];
    for (const file of js_files) {
        const content = read_text(file);
        const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
        assert(lines.length >= 16 && lines.length <= 256,
            `Page Rule violation: ${file} has ${lines.length} lines (16..=256)`);
        assert(lines[0] === '// SPDX-License-Identifier: GPL-3.0-or-later', `Missing SPDX header in ${file}`);
        assert(lines[1].startsWith('// ') && lines[1].length >= 12,
            `Missing concise module description on line 2 of ${file}`);
        if (file.startsWith(EXT_ROOT)) {
            for (const sym of legacy) {
                assert(!content.includes(sym), `Forbidden legacy symbol '${sym}' in ${file}`);
            }
        }
        for (let idx = 0; idx < lines.length; idx += 1) {
            const raw = lines[idx], ln = idx + 1, code = strip_strings_and_line_comment(raw);
            assert(raw.length <= 200, `Line ${ln} of ${file} exceeds 200 chars (${raw.length})`);
            if (!file.startsWith(EXT_ROOT)) continue;
            assert(!code.trimStart().startsWith('var ') && !code.includes(' var ') && !code.includes('(var '),
                `Forbidden var in ${file}:${ln}`);
            for (let i = 0; i < code.length - 1; i += 1) {
                const prev = i > 0 ? code[i - 1] : '';
                const prev_eq = prev === '=' || prev === '!' || prev === '<' || prev === '>';
                const next_eq = i + 2 < code.length && code[i + 2] === '=';
                assert(!(code[i] === '=' && code[i + 1] === '=' && !prev_eq && !next_eq), `Loose == in ${file}:${ln}`);
                assert(!(code[i] === '!' && code[i + 1] === '=' && !next_eq), `Loose != in ${file}:${ln}`);
            }
        }
    }
    for (const dir_path of dirs) {
        const enumerator = Gio.File.new_for_path(dir_path).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null,
        );
        const visible = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('.') && name !== 'dist' && name !== 'target') visible.push(name);
        }
        enumerator.close(null);
        assert(visible.length <= 8,
            `Directory density violation: ${dir_path} has ${visible.length} visible entries (max 8)`);
        for (const name of visible) {
            const stem = (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();
            assert(!BANNED_STEMS.has(stem), `Banned generic name '${name}' in ${dir_path}`);
        }
    }
}

function verify_process_boundaries_and_invariants() {
    const shared = [
        'prefs.js', 'tray/dbus_specs.js', 'ui/icon_style.js',
        'ui/settings/gsettings.js', 'ui/settings/prefs_pages.js',
    ];
    const compositor_only = ['gi://Meta', 'gi://Clutter', 'gi://St', 'gi://Shell', 'resource:///org/gnome/shell/'];
    for (const rel of shared) {
        for (const raw of read_text(GLib.build_filenamev([EXT_ROOT, rel])).split('\n')) {
            const trimmed = raw.trimStart();
            if (trimmed.startsWith('//')) continue;
            for (const sym of compositor_only) {
                assert(!raw.includes(sym), `Process-boundary violation: ${rel} imports '${sym}'`);
            }
        }
    }
    const check_files = [
        'extension.js', 'prefs.js', 'ui/settings/prefs_pages.js', 'tray/watcher.js',
        'tray/item_proxy.js', 'tray/panel_icon.js', 'tray/dbus_menu.js',
        'tray/legacy_tray.js', 'metadata.json', 'schemas/org.gnome.shell.extensions.shoal.gschema.xml',
    ];
    const combined = check_files.map((rel) => read_text(GLib.build_filenamev([EXT_ROOT, rel]))).join('\n');
    const reqs = [
        'export default class ShoalExtension extends Extension', 'this.watcher.destroy()',
        'fillPreferencesWindow(window)', 'Adw.PreferencesPage', 'close-request',
        'Shoal Settings & About…', 'openPreferences', 'Star Shoal on GitHub',
        'Tuition, Not Coffee — Help send my daughter to college',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'Derived from Ubuntu AppIndicator Support', 'org.kde.StatusNotifierWatcher',
        'org.freedesktop.StatusNotifierWatcher', '[shoal] sni-refresh', '[shoal] dbusmenu-reload',
        '"45"', '"50"', '"settings-schema": "org.gnome.shell.extensions.shoal"',
        'name="tray-pos"', 'v1.0.1',
        'this.unload_theme()', 'load_stylesheet(file)', 'Support &amp; Community',
        'NewMenu', 'NewIconThemePath', 'MAX_PATH_CACHE = 128', 'clear_icon_path_cache()',
        'this._active_names.size > 0', 'target.set_child_at_index(', '_fetch_ayatana_label()',
        'this.settings.tray_order() + this._items.size', 'Math.imul(hash ^ b[i], 16777619)',
    ];
    for (const req of reqs) assert(combined.includes(req), `Missing invariant: ${req}`);
    assert(!combined.includes('Rust installer') && !combined.includes('cargo install'), 'No Rust CLI reference');
    const prefs_pages = read_text(GLib.build_filenamev([EXT_ROOT, 'ui/settings/prefs_pages.js']));
    assert(!/new Gtk\.Label\(\{[^}]*&amp;/s.test(prefs_pages), 'Gtk.Label must not contain raw &amp; without use_markup');
}

async function verify_behavioral_and_gtk_suite() {
    const tmp_dir = GLib.dir_make_tmp('shoal-verify-XXXXXX');
    const schema_xml = 'org.gnome.shell.extensions.shoal.gschema.xml';
    const dst_xml = Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, schema_xml]));
    Gio.File.new_for_path(GLib.build_filenamev([EXT_ROOT, 'schemas', schema_xml]))
        .copy(dst_xml, Gio.FileCopyFlags.OVERWRITE, null, null);
    assert(Gio.Subprocess.new(['glib-compile-schemas', tmp_dir], Gio.SubprocessFlags.NONE).wait_check(null),
        'glib-compile-schemas');
    const src = Gio.SettingsSchemaSource.new_from_directory(tmp_dir, Gio.SettingsSchemaSource.get_default(), false);
    const ext_settings = new Gio.Settings({
        settings_schema: src.lookup('org.gnome.shell.extensions.shoal', true),
        backend: Gio.memory_settings_backend_new(),
    });
    const s = new ExtensionSettings(ext_settings);

    assert(s.tray_pos() === 'right' && s.tray_order() === 1 && s.compact_mode() && s.legacy_tray_enabled(), 'defaults');
    assert(s.icon_size() === 0 && s.icon_opacity() === 255 && s.icon_saturation() === 0, 'icon defaults');
    assert(TRAY_POSITIONS.length === 3 && MIDDLE_CLICK_ACTIONS.length === 3, 'enums');

    s.set_tray_pos('left');
    assert(s.tray_pos() === 'left' && resolve_panel_box_name(s.tray_pos()) === 'left', 'tray pos left');
    s.set_tray_pos('invalid');
    assert(s.tray_pos() === 'right' && resolve_panel_box_name(s.tray_pos()) === 'right', 'tray pos fallback');
    s.set_icon_size(99);
    assert(s.icon_size() === 48 && compute_effective_icon_size(s.icon_size()) === 48, 'clamp max icon size');
    s.set_icon_size(8);
    assert(s.icon_size() === 16 && compute_effective_icon_size(0) === DEFAULT_PANEL_ICON_SIZE, 'clamp min icon size');
    s.set_icon_opacity(10);
    assert(s.icon_opacity() === 64 && compute_icon_opacity(999) === 255, 'clamp opacity');
    s.set_icon_saturation(0.75);
    s.set_icon_brightness(-0.25);
    s.set_icon_contrast(0.5);
    const fx = compute_effect_params(s.icon_saturation(), s.icon_brightness(), s.icon_contrast());
    assert(fx.has_desaturate && fx.has_brightness_contrast && fx.desaturate === 0.75, 'effect math');
    assert(build_indicator_style_classes(true, true).includes('shoal-indicator-attention'), 'style classes');
    assert(build_icon_inline_style(24) === 'icon-size: 24px;' && build_icon_inline_style(0) === '', 'inline style');

    s.reset_defaults();
    assert(s.tray_pos() === 'right' && s.icon_size() === 0, 'reset defaults');

    assert(WATCHER_XML.includes('StatusNotifierWatcher'), 'dbus xml');
    const p1 = parse_sni_service('/org/ayatana/NotificationItem/steam', ':1.42'), p2 = parse_sni_service('org.kde.StatusNotifierItem-99-1', ':1.99');
    assert(p1.bus_name === ':1.42' && p1.obj_path === '/org/ayatana/NotificationItem/steam' && p2.obj_path === '/StatusNotifierItem', 'sni parse');
    const rgba = argb32_to_rgba(new Uint8Array([128, 255, 10, 20, 255, 11, 22, 33, 0, 99, 88, 77]), 3);
    assert(rgba[0] === 128 && rgba[1] === 5 && rgba[2] === 10 && rgba[3] === 128, 'ARGB32 -> premultiplied RGBA conversion (partial alpha)');
    assert(rgba[4] === 11 && rgba[5] === 22 && rgba[6] === 33 && rgba[7] === 255, 'ARGB32 -> RGBA fast-path (a === 255)');
    assert(rgba[8] === 0 && rgba[9] === 0 && rgba[10] === 0 && rgba[11] === 0, 'ARGB32 -> RGBA fast-path (a === 0)');
    const best_px = select_best_pixmap([[16, 16, new Uint8Array(16 * 16 * 4)], [24, 24, new Uint8Array(24 * 24 * 4)]], 22);
    assert(best_px && best_px.width === 24, 'select_best_pixmap');
    const dm_dict = new GLib.Variant('a{sv}', { label: new GLib.Variant('s', 'Settings'), enabled: new GLib.Variant('b', true) });
    assert(unpack_variant(dm_dict.unpack().label, '') === 'Settings' && unpack_variant(dm_dict.unpack().enabled, false) === true, 'unpack_variant a{sv}');

    let Gtk = null, Adw = null;
    try {
        Gtk = (await import('gi://Gtk?version=4.0')).default;
        Adw = (await import('gi://Adw?version=1')).default;
    } catch (_e) { /* headless environment without GTK4/Adw typelibs */ }
    if (Gtk && Adw && Gtk.init_check()) {
        Adw.init();
        const page_a = build_about_page();
        assert(page_a.get_title() === 'About & Support', 'GTK4 pages');
        let root_to_walk = [page_a];
        const gres = '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
        if (Gio.File.new_for_path(gres).query_exists(null)) {
            try {
                Gio.resources_register(Gio.Resource.load(gres));
                const { default: ShoalPreferences } = await import('../extension/prefs.js');
                const prefs = Object.create(ShoalPreferences.prototype), win = new Adw.PreferencesWindow();
                prefs.getSettings = () => ext_settings;
                prefs.fillPreferencesWindow(win);
                root_to_walk = [win];
            } catch (e) { if (!String(e).includes('Typelib file for namespace')) throw e; }
        }
        const walk_labels = (w) => {
            if (!w) return;
            if (w instanceof Gtk.Label) {
                const txt = w.get_text() || '';
                assert(!txt.includes('&amp;'), `Unescaped &amp; in rendered Gtk.Label text: ${txt}`);
                if (w.get_visible()) assert(txt.trim().length > 0, 'Empty visible Gtk.Label');
            }
            for (let c = w.get_first_child?.(); c; c = c.get_next_sibling?.()) walk_labels(c);
        };
        for (const r of root_to_walk) walk_labels(r);
    }

    dst_xml.delete(null);
    Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, 'gschemas.compiled'])).delete(null);
    Gio.File.new_for_path(tmp_dir).delete(null);
}

const js_files = [], dirs = [];
walk_repo(REPO_ROOT, js_files, dirs);
verify_page_rules_and_lint(js_files, dirs);
verify_process_boundaries_and_invariants();
await verify_behavioral_and_gtk_suite();
print(`OK: verified ${js_files.length} JS pages across ${dirs.length} directories and all headless behavioral suites.`);

// SPDX-License-Identifier: GPL-3.0-or-later
// Pure panel geometry, icon sizing, opacity, and desaturation/brightness/contrast math.

export const DEFAULT_PANEL_ICON_SIZE = 16;

export function resolve_panel_box_name(tray_pos) {
    if (tray_pos === 'left') return 'left';
    if (tray_pos === 'center') return 'center';
    return 'right';
}

export function compute_effective_icon_size(icon_size_setting) {
    const n = Math.round(Number(icon_size_setting) || 0);
    if (n <= 0) return DEFAULT_PANEL_ICON_SIZE;
    return Math.max(16, Math.min(48, n));
}

export function compute_icon_opacity(opacity_setting) {
    const n = Math.round(Number(opacity_setting) || 255);
    return Math.max(64, Math.min(255, n));
}

export function compute_effect_params(saturation, brightness, contrast) {
    const sat = Number.isFinite(Number(saturation))
        ? Math.max(0.0, Math.min(1.0, Number(saturation)))
        : 0.0;
    const bri = Number.isFinite(Number(brightness))
        ? Math.max(-1.0, Math.min(1.0, Number(brightness)))
        : 0.0;
    const con = Number.isFinite(Number(contrast))
        ? Math.max(-1.0, Math.min(1.0, Number(contrast)))
        : 0.0;
    return {
        desaturate: sat,
        has_desaturate: sat > 0.005,
        brightness: bri,
        contrast: con,
        has_brightness_contrast: Math.abs(bri) > 0.005 || Math.abs(con) > 0.005,
    };
}

export function build_indicator_style_classes(compact_mode, is_attention = false) {
    const classes = ['panel-button', 'shoal-indicator'];
    if (compact_mode) classes.push('shoal-indicator-compact');
    if (is_attention) classes.push('shoal-indicator-attention');
    return classes;
}

export function build_icon_inline_style(icon_size_setting) {
    const n = Math.round(Number(icon_size_setting) || 0);
    if (n <= 0) return '';
    const clamped = Math.max(16, Math.min(48, n));
    return `icon-size: ${clamped}px;`;
}

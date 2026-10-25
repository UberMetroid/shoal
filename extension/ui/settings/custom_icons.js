// SPDX-License-Identifier: GPL-3.0-or-later
// Custom icon override normalization, indicator ID matching, and CRUD helpers.

export const MAX_CUSTOM_ICONS = 64;

export function sanitize_icon_field(text) {
    if (typeof text !== 'string') return '';
    return text.trim().slice(0, 128);
}

export function normalize_custom_icons(entries) {
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < entries.length && out.length < MAX_CUSTOM_ICONS; i += 1) {
        const item = entries[i];
        if (!Array.isArray(item) || item.length < 2) continue;
        const id = sanitize_icon_field(item[0]);
        const normal = sanitize_icon_field(item[1]);
        const attention = sanitize_icon_field(item[2] ?? '');
        if (!id || !normal) continue;
        const key = id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([id, normal, attention]);
    }
    return out;
}

export function upsert_custom_icon(entries, indicator_id, normal_icon, attention_icon = '') {
    const id = sanitize_icon_field(indicator_id);
    const normal = sanitize_icon_field(normal_icon);
    const attention = sanitize_icon_field(attention_icon);
    const current = normalize_custom_icons(entries);
    if (!id || !normal) return current;
    const key = id.toLowerCase();
    const next = [];
    let replaced = false;
    for (const row of current) {
        if (row[0].toLowerCase() === key) {
            next.push([id, normal, attention]);
            replaced = true;
        } else {
            next.push(row);
        }
    }
    if (!replaced && next.length < MAX_CUSTOM_ICONS) {
        next.push([id, normal, attention]);
    }
    return next;
}

export function remove_custom_icon(entries, indicator_id) {
    const key = sanitize_icon_field(indicator_id).toLowerCase();
    const current = normalize_custom_icons(entries);
    if (!key) return current;
    return current.filter((row) => row[0].toLowerCase() !== key);
}

export function resolve_custom_icon(entries, indicator_id, title = '', is_attention = false) {
    const list = normalize_custom_icons(entries);
    if (list.length === 0) return null;
    const id_lower = sanitize_icon_field(indicator_id).toLowerCase();
    const title_lower = sanitize_icon_field(title).toLowerCase();

    for (const [match_id, normal_icon, attention_icon] of list) {
        const needle = match_id.toLowerCase();
        const matched = (id_lower && (id_lower === needle || id_lower.includes(needle))) ||
            (title_lower && (title_lower === needle || title_lower.includes(needle)));
        if (matched) {
            if (is_attention && attention_icon) return attention_icon;
            return normal_icon || null;
        }
    }
    return null;
}

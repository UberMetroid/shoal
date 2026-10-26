// SPDX-License-Identifier: GPL-3.0-or-later
// Embedded D-Bus XML introspection spec, SNI service address parser, and ARGB32-to-RGBA helpers.

export const WATCHER_XML = `
<node>
  <interface name="org.kde.StatusNotifierWatcher">
    <method name="RegisterStatusNotifierItem">
      <arg type="s" direction="in" name="service"/>
    </method>
    <method name="RegisterStatusNotifierHost">
      <arg type="s" direction="in" name="service"/>
    </method>
    <property name="RegisteredStatusNotifierItems" type="as" access="read"/>
    <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
    <property name="ProtocolVersion" type="i" access="read"/>
    <signal name="StatusNotifierItemRegistered">
      <arg type="s" name="service"/>
    </signal>
    <signal name="StatusNotifierItemUnregistered">
      <arg type="s" name="service"/>
    </signal>
    <signal name="StatusNotifierHostRegistered"/>
    <signal name="StatusNotifierHostUnregistered"/>
  </interface>
</node>`;

export function unpack_variant(val, def = null) {
    let cur = val;
    if (cur === undefined || cur === null) return def;
    try {
        while (typeof cur === 'object' && cur !== null && typeof cur.deep_unpack === 'function') {
            cur = cur.deep_unpack();
        }
        return cur ?? def;
    } catch (_e) {
        return def;
    }
}

export function parse_sni_service(service_or_path, sender = '') {
    const raw = typeof service_or_path === 'string' ? service_or_path.trim() : '';
    const snd = typeof sender === 'string' ? sender.trim() : '';
    if (!raw && !snd) return null;

    let bus_name = snd;
    let obj_path = '/StatusNotifierItem';

    if (raw.startsWith('/')) {
        obj_path = raw;
        if (!bus_name) return null;
    } else if (raw.includes('/')) {
        const slash = raw.indexOf('/');
        const head = raw.slice(0, slash).trim();
        const tail = raw.slice(slash).trim();
        bus_name = head || snd;
        if (tail.startsWith('/')) obj_path = tail;
    } else if (raw) {
        bus_name = raw;
    }

    if (!bus_name) return null;
    const key = `${bus_name}${obj_path}`;
    return { bus_name, obj_path, key };
}

export function select_best_pixmap(pixmaps, target_size = 16) {
    if (!Array.isArray(pixmaps) || pixmaps.length === 0) return null;
    const goal = Math.max(16, Math.min(64, Math.round(Number(target_size) || 16)));
    let best = null;
    let best_dist = Infinity;
    for (const item of pixmaps) {
        if (!Array.isArray(item) || item.length < 3) continue;
        const w = Number(item[0]) || 0;
        const h = Number(item[1]) || 0;
        const bytes = item[2];
        if (w <= 0 || h <= 0 || w > 256 || h > 256 || !bytes) continue;
        const len = bytes.length ?? bytes.byteLength ?? 0;
        if (len < w * h * 4) continue;
        const dist = Math.abs(w - goal) + (w < goal ? 32 : 0);
        if (dist < best_dist) {
            best_dist = dist;
            best = { width: w, height: h, bytes };
        }
    }
    return best;
}

export function argb32_to_rgba(src_bytes, pixel_count) {
    const total = Math.max(0, Math.min(65536, Number(pixel_count) || 0)) * 4;
    const out = new Uint8Array(total);
    if (!src_bytes || total === 0) return out;
    const len = Math.min(total, src_bytes.length ?? src_bytes.byteLength ?? 0);
    for (let i = 0; i + 3 < len; i += 4) {
        const a = src_bytes[i];
        if (a === 255) {
            out[i] = src_bytes[i + 1];
            out[i + 1] = src_bytes[i + 2];
            out[i + 2] = src_bytes[i + 3];
            out[i + 3] = 255;
        } else if (a !== 0) {
            out[i] = ((src_bytes[i + 1] * a + 127) / 255) | 0;
            out[i + 1] = ((src_bytes[i + 2] * a + 127) / 255) | 0;
            out[i + 2] = ((src_bytes[i + 3] * a + 127) / 255) | 0;
            out[i + 3] = a;
        }
    }
    return out;
}

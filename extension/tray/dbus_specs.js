// SPDX-License-Identifier: GPL-3.0-or-later
// Embedded D-Bus XML introspection specs, SNI service address parser, and ARGB32-to-RGBA helpers.

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

export const ITEM_XML = `
<node>
  <interface name="org.kde.StatusNotifierItem">
    <method name="ContextMenu">
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
    </method>
    <method name="Activate">
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
    </method>
    <method name="SecondaryActivate">
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
    </method>
    <method name="Scroll">
      <arg type="i" direction="in" name="delta"/>
      <arg type="s" direction="in" name="orientation"/>
    </method>
  </interface>
</node>`;

export const DBUSMENU_XML = `
<node>
  <interface name="com.canonical.dbusmenu">
    <method name="GetLayout">
      <arg type="i" direction="in" name="parentId"/>
      <arg type="i" direction="in" name="recursionDepth"/>
      <arg type="as" direction="in" name="propertyNames"/>
      <arg type="u" direction="out" name="revision"/>
      <arg type="(ia{sv}av)" direction="out" name="layout"/>
    </method>
    <method name="Event">
      <arg type="i" direction="in" name="id"/>
      <arg type="s" direction="in" name="eventId"/>
      <arg type="v" direction="in" name="data"/>
      <arg type="u" direction="in" name="timestamp"/>
    </method>
    <method name="AboutToShow">
      <arg type="i" direction="in" name="id"/>
      <arg type="b" direction="out" name="needUpdate"/>
    </method>
    <signal name="ItemsPropertiesUpdated">
      <arg type="a(ia{sv})" name="updatedProps"/>
      <arg type="a(ias)" name="removedProps"/>
    </signal>
    <signal name="LayoutUpdated">
      <arg type="u" name="revision"/>
      <arg type="i" name="parent"/>
    </signal>
  </interface>
</node>`;

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
        const r = src_bytes[i + 1];
        const g = src_bytes[i + 2];
        const b = src_bytes[i + 3];
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = a;
    }
    return out;
}

// SPDX-License-Identifier: GPL-3.0-or-later
// GNOME Shell extension entrypoint (ShoalExtension extends Extension) managing enable/disable.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { TrayWatcher } from './tray/watcher.js';

export default class ShoalExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.watcher = null;
    }

    enable() {
        if (this.watcher !== null) return;
        this.watcher = new TrayWatcher(this);
    }

    disable() {
        if (this.watcher !== null) {
            this.unload_theme();
            this.watcher.destroy();
            this.watcher = null;
        }
    }

    unload_theme() {
        if (this.watcher !== null) {
            this.watcher.unload_theme();
        }
    }
}

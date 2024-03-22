/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  MailExtensionShortcuts: "resource:///modules/MailExtensionShortcuts.sys.mjs",
});

this.commands = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onCommand({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(eventName, commandName) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        const tab = tabManager.convert(tabTracker.activeTab);
        fire.async(commandName, tab);
      }
      this.on("command", listener);
      return {
        unregister: () => {
          this.off("command", listener);
        },
        convert(_fire, _context) {
          fire = _fire;
          context = _context;
        },
      };
    },
    onChanged({ context, fire }) {
      async function listener(eventName, changeInfo) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(changeInfo);
      }
      this.on("shortcutChanged", listener);
      return {
        unregister: () => {
          this.off("shortcutChanged", listener);
        },
        convert(_fire, _context) {
          fire = _fire;
          context = _context;
        },
      };
    },
  };

  static onUninstall(extensionId) {
    return MailExtensionShortcuts.removeCommandsFromStorage(extensionId);
  }

  async onManifestEntry() {
    const shortcuts = new MailExtensionShortcuts({
      extension: this.extension,
      onCommand: name => this.emit("command", name),
      onShortcutChanged: changeInfo => this.emit("shortcutChanged", changeInfo),
    });
    this.extension.shortcuts = shortcuts;
    await shortcuts.loadCommands();
    await shortcuts.register();
  }

  onShutdown() {
    this.extension.shortcuts.unregister();
  }

  getAPI(context) {
    return {
      commands: {
        getAll: () => this.extension.shortcuts.allCommands(),
        update: args => this.extension.shortcuts.updateCommand(args),
        reset: name => this.extension.shortcuts.resetCommand(name),
        onCommand: new EventManager({
          context,
          module: "commands",
          event: "onCommand",
          inputHandling: true,
          extensionApi: this,
        }).api(),
        onChanged: new EventManager({
          context,
          module: "commands",
          event: "onChanged",
          extensionApi: this,
        }).api(),
      },
    };
  }
};

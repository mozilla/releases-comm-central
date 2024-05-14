/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GenericProtocolPrototype } from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/irc.ftl"], true)
);

ChromeUtils.defineESModuleGetters(lazy, {
  ircAccount: "resource:///modules/ircAccount.sys.mjs",
});

export function ircProtocol() {
  // ircCommands.sys.mjs exports one variable: commands. Import this directly into
  // the protocol object.
  this.commands = ChromeUtils.importESModule(
    "resource:///modules/ircCommands.sys.mjs"
  ).commands;
  this.registerCommands();
}

ircProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get name() {
    return "IRC";
  },
  get normalizedName() {
    return "irc";
  },
  get iconBaseURI() {
    return "chrome://prpl-irc/skin/";
  },
  get usernameEmptyText() {
    return lazy.l10n.formatValueSync("irc-username-hint");
  },

  usernameSplits: [
    {
      get label() {
        return lazy.l10n.formatValueSync("options-server");
      },
      separator: "@",
      defaultValue: "irc.libera.chat",
    },
  ],

  splitUsername(aName) {
    const splitter = aName.lastIndexOf("@");
    if (splitter === -1) {
      return [];
    }
    return [aName.slice(0, splitter), aName.slice(splitter + 1)];
  },

  options: {
    port: {
      get label() {
        return lazy.l10n.formatValueSync("options-port");
      },
      default: 6697,
    },
    ssl: {
      get label() {
        return lazy.l10n.formatValueSync("options-ssl");
      },
      default: true,
    },
    // TODO We should attempt to auto-detect encoding instead.
    encoding: {
      get label() {
        return lazy.l10n.formatValueSync("options-encoding");
      },
      default: "UTF-8",
    },
    quitmsg: {
      get label() {
        return lazy.l10n.formatValueSync("options-quit-message");
      },
      get default() {
        return Services.prefs.getCharPref("chat.irc.defaultQuitMessage");
      },
    },
    partmsg: {
      get label() {
        return lazy.l10n.formatValueSync("options-part-message");
      },
      default: "",
    },
    showServerTab: {
      get label() {
        return lazy.l10n.formatValueSync("options-show-server-tab");
      },
      default: false,
    },
    alternateNicks: {
      get label() {
        return lazy.l10n.formatValueSync("options-alternate-nicks");
      },
      default: "",
    },
  },

  get chatHasTopic() {
    return true;
  },
  get slashCommandsNative() {
    return true;
  },
  //  Passwords in IRC are optional, and are needed for certain functionality.
  get passwordOptional() {
    return true;
  },

  getAccount(aImAccount) {
    return new lazy.ircAccount(this, aImAccount);
  },
};

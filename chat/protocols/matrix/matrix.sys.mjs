/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { GenericProtocolPrototype } from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineLazyGetter(lazy, "brandShortName", () =>
  Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandShortName")
);
ChromeUtils.defineESModuleGetters(lazy, {
  MatrixAccount: "resource:///modules/matrixAccount.sys.mjs",
});

export function MatrixProtocol() {
  this.commands = ChromeUtils.importESModule(
    "resource:///modules/matrixCommands.sys.mjs"
  ).commands;
  this.registerCommands();
}

MatrixProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "matrix";
  },
  get name() {
    return "Matrix";
  },
  get iconBaseURI() {
    return "chrome://prpl-matrix/skin/";
  },
  getAccount(aImAccount) {
    return new lazy.MatrixAccount(this, aImAccount);
  },

  get usernameEmptyText() {
    return lazy._("matrix.usernameHint");
  },
  usernamePrefix: "@",
  usernameSplits: [
    {
      get label() {
        return lazy._("options.homeserver");
      },
      separator: ":",
    },
  ],

  options: {
    saveToken: {
      get label() {
        return lazy._("options.saveToken");
      },
      default: true,
    },
    deviceDisplayName: {
      get label() {
        return lazy._("options.deviceDisplayName");
      },
      get default() {
        return lazy.brandShortName;
      },
    },
    backupPassphrase: {
      get label() {
        return lazy._("options.backupPassphrase");
      },
      default: "",
      masked: true,
    },
  },

  get chatHasTopic() {
    return true;
  },
  //TODO this should depend on the server (i.e. if it offers SSO). Should also have noPassword true if there is no password login flow available.
  get passwordOptional() {
    return true;
  },
  get canEncrypt() {
    return true;
  },
};

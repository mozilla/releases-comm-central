/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { manager: Cm } = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

const EnigmailCompat = ChromeUtils.import(
  "chrome://openpgp/content/modules/compat.jsm"
).EnigmailCompat;
const Services = ChromeUtils.import("resource://gre/modules/Services.jsm")
  .Services;

const CATEGORY = "mailnews-accountmanager-extensions";
const CATEGORY_ENTRY = "openpgp-account-manager-extension";
const PREF_SERVICE_NAME =
  "@mozilla.org/accountmanager/extension;1?name=enigprefs";

var EXPORTED_SYMBOLS = ["EnigmailAmPrefsService"];

var EnigmailAmPrefsService = {
  startup(reason) {
    try {
      Services.catMan.addCategoryEntry(
        CATEGORY,
        CATEGORY_ENTRY,
        PREF_SERVICE_NAME,
        false,
        true
      );
      this.factory = new Factory(EnigmailPrefService);
    } catch (ex) {}
  },

  shutdown(reason) {
    Services.catMan.deleteCategoryEntry(CATEGORY, CATEGORY_ENTRY, false);

    if (this.factory) {
      this.factory.unregister();
    }
  },
};

function EnigmailPrefService() {}

EnigmailPrefService.prototype = {
  name: "enigprefs",
  chromePackageName: "openpgp",
  classID: Components.ID("{f2be6d32-ff3c-11e9-8e8b-00163e5e6c00}"),
  classDescription: "OpenPGP Account Manager Extension Service",
  contractID: PREF_SERVICE_NAME,
  QueryInterface: EnigmailCompat.generateQI(["nsIMsgAccountManagerExtension"]),

  showPanel(server) {
    // show Enigmail panel for POP3, IMAP, NNTP and "movemail" (unix) account types
    switch (server.type) {
      case "nntp":
      case "imap":
      case "pop3":
      case "movemail":
        return true;
    }
    return false;
  },
};

class Factory {
  constructor(component) {
    this.component = component;
    this.register();
    Object.freeze(this);
  }

  createInstance(outer, iid) {
    if (outer) {
      throw Cr.NS_ERROR_NO_AGGREGATION;
    }
    return new this.component();
  }

  register() {
    Cm.registerFactory(
      this.component.prototype.classID,
      this.component.prototype.classDescription,
      this.component.prototype.contractID,
      this
    );
  }

  unregister() {
    Cm.unregisterFactory(this.component.prototype.classID, this);
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["OpenPGPAlias"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");

Cu.importGlobalProperties(["fetch"]);

var OpenPGPAlias = {
  _aliasDomains: null,
  _aliasEmails: null,

  _loaded() {
    return this._aliasDomains && this._aliasEmails;
  },

  async load() {
    let path = Services.prefs.getStringPref(
      "mail.openpgp.alias_rules_file",
      ""
    );

    if (!path) {
      this._clear();
      return;
    }

    await this._loadFromFile(path);
  },

  _clear() {
    this._aliasDomains = new Map();
    this._aliasEmails = new Map();
  },

  async _loadFromFile(src) {
    this._clear();

    let aliasRules;
    let jsonData;
    if (src.startsWith("file://")) {
      let response = await fetch(src);
      jsonData = await response.json();
    } else if (src.includes("/") || src.includes("\\")) {
      throw new Error(`Invalid alias rules src: ${src}`);
    } else {
      let spec = OS.Path.join(OS.Constants.Path.profileDir, src);
      let response = await fetch(OS.Path.toFileURI(spec));
      jsonData = await response.json();
    }
    if (!("rules" in jsonData)) {
      throw new Error(
        "alias file contains invalid JSON data, no rules element found"
      );
    }
    aliasRules = jsonData.rules;

    for (let entry of aliasRules) {
      if (!("keys" in entry)) {
        continue;
      }
      // Ignore duplicate rules, only use first rule per key.
      // Require email address contains @, and domain doesn't contain @.
      if ("email" in entry) {
        if (!entry.email.includes("@")) {
          console.log("Ignoring invalid email alias rule: " + entry.email);
          continue;
        }
        if (this._aliasEmails.get(entry.email)) {
          console.log("Ignoring duplicate email alias rule: " + entry.email);
        } else {
          this._aliasEmails.set(entry.email, entry.keys);
        }
      } else if ("domain" in entry) {
        if (entry.domain.includes("@")) {
          console.log("Ignoring invalid domain alias rule: " + entry.domain);
          continue;
        }
        if (this._aliasDomains.get(entry.domain)) {
          console.log("Ignoring duplicate domain alias rule: " + entry.domain);
        } else {
          this._aliasDomains.set(entry.domain, entry.keys);
        }
      }
    }
  },

  getDomainAliasKeyList(email) {
    if (!this._loaded()) {
      return null;
    }

    let lastAt = email.lastIndexOf("@");
    if (lastAt == -1) {
      return null;
    }

    let domain = email.substr(lastAt + 1);
    if (!domain) {
      return null;
    }

    return this._aliasDomains.get(domain);
  },

  getEmailAliasKeyList(email) {
    if (!this._loaded()) {
      return null;
    }
    return this._aliasEmails.get(email);
  },
};

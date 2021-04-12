/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["OpenPGPAlias"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

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

  _hasExpectedKeysStructure(keys) {
    try {
      for (let entry of keys) {
        if (!("id" in entry) && !("fingerprint" in entry)) {
          return false;
        }
      }
      // all entries passed the test
      return true;
    } catch (ex) {
      return false;
    }
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
      let spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        src
      );
      let response = await fetch(PathUtils.toFileURI(spec));
      jsonData = await response.json();
    }
    if (!("rules" in jsonData)) {
      throw new Error(
        "alias file contains invalid JSON data, no rules element found"
      );
    }
    aliasRules = jsonData.rules;

    for (let entry of aliasRules) {
      if (!("keys" in entry) || !entry.keys || !entry.keys.length) {
        console.log("Ignoring invalid alias rule without keys");
        continue;
      }
      if ("email" in entry && "domain" in entry) {
        console.log("Ignoring invalid alias rule with both email and domain");
        continue;
      }
      // Ignore duplicate rules, only use first rule per key.
      // Require email address contains @, and domain doesn't contain @.
      if ("email" in entry) {
        let email = entry.email.toLowerCase();
        if (!email.includes("@")) {
          console.log("Ignoring invalid email alias rule: " + email);
          continue;
        }
        if (this._aliasEmails.get(email)) {
          console.log("Ignoring duplicate email alias rule: " + email);
          continue;
        }
        if (!this._hasExpectedKeysStructure(entry.keys)) {
          console.log(
            "Ignoring alias rule with invalid key entries for email " + email
          );
          continue;
        }
        this._aliasEmails.set(email, entry.keys);
      } else if ("domain" in entry) {
        let domain = entry.domain.toLowerCase();
        if (domain.includes("@")) {
          console.log("Ignoring invalid domain alias rule: " + domain);
          continue;
        }
        if (this._aliasDomains.get(domain)) {
          console.log("Ignoring duplicate domain alias rule: " + domain);
          continue;
        }
        if (!this._hasExpectedKeysStructure(entry.keys)) {
          console.log(
            "Ignoring alias rule with invalid key entries for domain " + domain
          );
          continue;
        }
        this._aliasDomains.set(domain, entry.keys);
      } else {
        console.log(
          "Ignoring invalid alias rule without domain and without email"
        );
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

    return this._aliasDomains.get(domain.toLowerCase());
  },

  getEmailAliasKeyList(email) {
    if (!this._loaded()) {
      return null;
    }
    return this._aliasEmails.get(email.toLowerCase());
  },
};

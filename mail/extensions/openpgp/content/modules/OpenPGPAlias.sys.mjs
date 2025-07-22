/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Thunderbird OpenPGP Alias Keys feature is used for sending an encrypted
 * email using a public key that does not contain (or does not match) the email
 * address of a message recipient.
 *
 * For example, a correspondent might ask you to use a particular public key for
 * sending them encrypted email, but that public key doesn't contain their email
 * address.
 *
 * Another example is a company that might have published a single public key
 * for sending encrypted email to any employee of the company, and the public
 * key doesn't contain any email address. When receiving an email that was
 * encrypted with that key, the company might then decrypt the email, and then
 * forward the decrypted email to the intended recipient. While this isn't
 * complete End-To-End Encryption, at least the email will be encrypted while
 * passing through the public Internet, until it arrives at the company's email server.
 *
 * Usually, Thunderbird refuses to use a key with a mismatching email address.
 * By using the Alias Keys Feature, you can override Thunderbird's usual checks,
 * and tell Thunderbird to use a public key anyway.
 */

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});
export var OpenPGPAlias = {
  _aliasDomains: null,
  _aliasEmails: null,

  _loaded() {
    return this._aliasDomains && this._aliasEmails;
  },

  async load() {
    const path = Services.prefs.getStringPref(
      "mail.openpgp.alias_rules_file",
      ""
    );

    if (!path) {
      this._clear();
      return;
    }

    try {
      await this._loadFromFile(path);
    } catch (e) {
      lazy.log.warn(`Loading alias_rules_file from ${path} FAILED!`, e);
    }
  },

  _clear() {
    this._aliasDomains = new Map();
    this._aliasEmails = new Map();
  },

  _hasExpectedKeysStructure(keys) {
    try {
      for (const entry of keys) {
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

  /**
   * Load alias rules from file.
   *
   * @param {string} src - Filename of json file in profile, or file:// URL.
   */
  async _loadFromFile(src) {
    this._clear();

    let jsonData;
    if (src.startsWith("file://")) {
      const response = await fetch(src);
      jsonData = await response.json();
    } else if (src.includes("/") || src.includes("\\")) {
      throw new Error(`Invalid alias rules src: ${src}`);
    } else {
      const spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        src
      );
      const response = await fetch(PathUtils.toFileURI(spec));
      jsonData = await response.json();
    }
    if (!("rules" in jsonData)) {
      throw new Error(
        "alias file contains invalid JSON data, no rules element found"
      );
    }
    const aliasRules = jsonData.rules;

    for (const entry of aliasRules) {
      if (!("keys" in entry) || !entry.keys || !entry.keys.length) {
        lazy.log.warn("Ignoring invalid alias rule without keys");
        continue;
      }
      if ("email" in entry && "domain" in entry) {
        lazy.log.warn("Ignoring invalid alias rule with both email and domain");
        continue;
      }
      // Ignore duplicate rules, only use first rule per key.
      // Require email address contains @, and domain doesn't contain @.
      if ("email" in entry) {
        const email = entry.email.toLowerCase();
        if (!email.includes("@")) {
          lazy.log.warn("Ignoring invalid email alias rule: " + email);
          continue;
        }
        if (this._aliasEmails.get(email)) {
          lazy.log.warn("Ignoring duplicate email alias rule: " + email);
          continue;
        }
        if (!this._hasExpectedKeysStructure(entry.keys)) {
          lazy.log.warn(
            "Ignoring alias rule with invalid key entries for email " + email
          );
          continue;
        }
        this._aliasEmails.set(email, entry.keys);
      } else if ("domain" in entry) {
        const domain = entry.domain.toLowerCase();
        if (domain.includes("@")) {
          lazy.log.warn("Ignoring invalid domain alias rule: " + domain);
          continue;
        }
        if (this._aliasDomains.get(domain)) {
          lazy.log.warn("Ignoring duplicate domain alias rule: " + domain);
          continue;
        }
        if (!this._hasExpectedKeysStructure(entry.keys)) {
          lazy.log.warn(
            "Ignoring alias rule with invalid key entries for domain " + domain
          );
          continue;
        }
        this._aliasDomains.set(domain, entry.keys);
      } else {
        lazy.log.warn(
          "Ignoring invalid alias rule without domain and without email"
        );
      }
    }
  },

  getDomainAliasKeyList(email) {
    if (!this._loaded()) {
      return null;
    }

    const lastAt = email.lastIndexOf("@");
    if (lastAt == -1) {
      return null;
    }

    const domain = email.substr(lastAt + 1);
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

  hasAliasDefinition(email) {
    if (!this._loaded()) {
      return false;
    }
    email = email.toLowerCase();
    const hasEmail = this._aliasEmails.has(email);
    if (hasEmail) {
      return true;
    }

    const lastAt = email.lastIndexOf("@");
    if (lastAt == -1) {
      return false;
    }

    const domain = email.substr(lastAt + 1);
    if (!domain) {
      return false;
    }

    return this._aliasDomains.has(domain);
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.sys.mjs",
});

/**
 * @typedef {LDAPCredentials} LDAPStateData
 * @property {number} maxResults - The max results for the LDAP Directory.
 * @property {number} scope - The scope (number value) of the LDAP Directory.
 * @property {string} loginMethod - The login method of the LDAP directory.
 * @property {string} searchFilter - The search filter on the LDAP Directory.
 * @property {boolean} isAdvanced - Boolean to determine if state is advanced.
 */

export const LDAPDirectoryUtils = {
  /**
   * Creates LDAP directory, and returns the directory.
   *
   * @param {LDAPStateData} credentials - LDAP form state data.
   * @returns {nsIAbDirectory} LDAP directory.
   */
  createDirectory(credentials) {
    let hostname = credentials.hostname;

    if (
      hostname.includes(":") &&
      hostname.at(0) != "[" &&
      hostname.at(-1) != "]"
    ) {
      // Wrap IPv6 address in [].
      hostname = `[${hostname}]`;
    }

    const url = `${credentials.ssl ? "ldaps" : "ldap"}://${hostname}:${credentials.port}`;
    const ldapURL = Services.io.newURI(url).QueryInterface(Ci.nsILDAPURL);
    ldapURL.dn = credentials.baseDn;

    if (credentials.isAdvanced) {
      ldapURL.scope = credentials.scope;
      ldapURL.filter = credentials.searchFilter;
    }

    const directoryID = lazy.MailServices.ab.newAddressBook(
      credentials.name,
      ldapURL.spec,
      Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
    );

    const ldapDirectory = lazy.MailServices.ab
      .getDirectoryFromId(directoryID)
      .QueryInterface(Ci.nsIAbLDAPDirectory);
    ldapDirectory.authDn = credentials.bindDn;

    if (credentials.isAdvanced) {
      ldapDirectory.maxHits = credentials.maxResults;
      ldapDirectory.saslMechanism = credentials.loginMethod;
    }

    return ldapDirectory;
  },
};

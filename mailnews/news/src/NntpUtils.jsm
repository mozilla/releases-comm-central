/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpUtils"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

/**
 * Collection of helper functions for NNTP.
 */
var NntpUtils = {
  /**
   * Find a server instance by its hostname.
   *
   * Sometimes we create a server instance to load a news url, this server is
   * written to the prefs but not associated with any account. Different from
   * nsIMsgAccountManager.findRealServer which can only find servers associated
   * with accounts, this function looks for NNTP server in the mail.server.
   * branch directly.
   *
   * @param {string} hostname - The hostname of the server.
   * @returns {nsINntpIncomingServer|null}
   */
  findServer(hostname) {
    let branch = Services.prefs.getBranch("mail.server.");

    // Collect all the server keys.
    let keySet = new Set();
    for (let name of branch.getChildList("")) {
      keySet.add(name.split(".")[0]);
    }

    // Find the NNTP server that matches the hostname.
    for (let key of keySet) {
      let type = branch.getCharPref(`${key}.type`, "");
      let hostnameValue = branch.getCharPref(`${key}.hostname`, "");
      let realHostnameValue = branch.getCharPref(`${key}.realhostname`, "");
      if (
        type == "nntp" &&
        [hostnameValue, realHostnameValue].includes(hostname)
      ) {
        return MailServices.accounts
          .getIncomingServer(key)
          .QueryInterface(Ci.nsINntpIncomingServer);
      }
    }
    return null;
  },
};

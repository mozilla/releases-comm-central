/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Collection of helper functions for NNTP.
 */
export var NntpUtils = {
  logger: console.createInstance({
    prefix: "mailnews.nntp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.nntp.loglevel",
  }),

  /**
   * Find a server instance by its hostname.
   *
   * Sometimes we create a server instance to load a news url, this server is
   * written to the prefs but not associated with any account. Different from
   * nsIMsgAccountManager.findServer which can only find servers associated
   * with accounts, this function looks for NNTP server in the mail.server.
   * branch directly.
   *
   * @param {string} hostname - The hostname of the server.
   * @returns {nsINntpIncomingServer|null}
   */
  findServer(hostname) {
    const branch = Services.prefs.getBranch("mail.server.");

    // Collect all the server keys.
    const keySet = new Set();
    for (const name of branch.getChildList("")) {
      keySet.add(name.split(".")[0]);
    }

    // Find the NNTP server that matches the hostname.
    hostname = hostname.toLowerCase();
    for (const key of keySet) {
      const type = branch.getCharPref(`${key}.type`, "");
      const hostnameValue = branch
        .getCharPref(`${key}.hostname`, "")
        .toLowerCase();
      if (type == "nntp" && hostnameValue == hostname) {
        try {
          return MailServices.accounts
            .getIncomingServer(key)
            .QueryInterface(Ci.nsINntpIncomingServer);
        } catch (e) {
          // In some profiles, two servers have the same hostname, but only one
          // can be loaded into AccountManager. Catch the error here and the
          // already loaded server will be found.
        }
      }
    }
    return null;
  },
};

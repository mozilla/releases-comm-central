/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Migrate profile (prefs and other files) from older versions of Mailnews to
 * current.
 * This should be run at startup. It migrates as needed: each migration
 * function should be written to be a no-op when the value is already migrated
 * or was never used in the old version.
 */

const EXPORTED_SYMBOLS = ["migrateMailnews"];

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "migrateServerUris",
  "resource:///modules/MsgIncomingServer.jsm"
);

function migrateMailnews() {
  const migrations = [migrateServerAndUserName];

  for (const fn of migrations) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * For each mail.server.key. branch,
 *   - migrate realhostname to hostname
 *   - migrate realuserName to userName
 */
function migrateServerAndUserName() {
  const branch = Services.prefs.getBranch("mail.server.");

  // Collect all the server keys.
  const keySet = new Set();
  for (const name of branch.getChildList("")) {
    keySet.add(name.split(".")[0]);
  }
  keySet.delete("default");

  for (const key of keySet) {
    const type = branch.getCharPref(`${key}.type`, "");
    const hostname = branch.getCharPref(`${key}.hostname`, "");
    const username = branch.getCharPref(`${key}.userName`, "");
    const realHostname = branch.getCharPref(`${key}.realhostname`, "");
    if (realHostname) {
      branch.setCharPref(`${key}.hostname`, realHostname);
      branch.clearUserPref(`${key}.realhostname`);
    }
    const realUsername = branch.getCharPref(`${key}.realuserName`, "");
    if (realUsername) {
      branch.setCharPref(`${key}.userName`, realUsername);
      branch.clearUserPref(`${key}.realuserName`);
    }
    // Previously, when hostname/username changed, LoginManager and many prefs
    // still contain the old hostname/username, try to migrate them to use the
    // new hostname/username.
    if (
      ["imap", "pop3", "nntp"].includes(type) &&
      (realHostname || realUsername)
    ) {
      const localStoreType = { imap: "imap", pop3: "mailbox", nntp: "news" }[
        type
      ];
      lazy.migrateServerUris(
        localStoreType,
        hostname,
        username,
        realHostname || hostname,
        realUsername || username
      );
    }
  }
}

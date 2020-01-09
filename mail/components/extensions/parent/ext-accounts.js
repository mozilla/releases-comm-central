/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "fixIterator",
  "resource:///modules/iteratorUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "toXPCOMArray",
  "resource:///modules/iteratorUtils.jsm"
);

function convertAccount(account) {
  account = account.QueryInterface(Ci.nsIMsgAccount);
  let server = account.incomingServer;
  if (server.type == "im") {
    return null;
  }

  let traverse = function(folder) {
    let f = convertFolder(folder, account.key);
    f.subFolders = [];
    for (let subFolder of fixIterator(folder.subFolders, Ci.nsIMsgFolder)) {
      f.subFolders.push(traverse(subFolder));
    }
    return f;
  };
  let folders = traverse(account.incomingServer.rootFolder).subFolders;

  return {
    id: account.key,
    name: account.incomingServer.prettyName,
    type: account.incomingServer.type,
    folders,
  };
}

this.accounts = class extends ExtensionAPI {
  getAPI(context) {
    return {
      accounts: {
        async list() {
          let accounts = [];
          for (let account of fixIterator(
            MailServices.accounts.accounts,
            Ci.nsIMsgAccount
          )) {
            account = convertAccount(account);
            if (account) {
              accounts.push(account);
            }
          }
          return accounts;
        },
        async get(accountId) {
          let account = MailServices.accounts.getAccount(accountId);
          if (account) {
            return convertAccount(account);
          }
          return null;
        },
      },
    };
  }
};

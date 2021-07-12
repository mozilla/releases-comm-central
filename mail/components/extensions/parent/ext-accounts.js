/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

this.accounts = class extends ExtensionAPI {
  getAPI(context) {
    return {
      accounts: {
        async list(includeFolders) {
          let accounts = [];
          for (let account of MailServices.accounts.accounts) {
            account = convertAccount(account, includeFolders);
            if (account) {
              accounts.push(account);
            }
          }
          return accounts;
        },
        async get(accountId, includeFolders) {
          let account = MailServices.accounts.getAccount(accountId);
          return convertAccount(account, includeFolders);
        },
        async getDefault(includeFolders) {
          let account = MailServices.accounts.defaultAccount;
          return convertAccount(account, includeFolders);
        },
        async getDefaultIdentity(accountId) {
          let account = MailServices.accounts.getAccount(accountId);
          return convertMailIdentity(account, account?.defaultIdentity);
        },
        async setDefaultIdentity(accountId, identityId) {
          let account = MailServices.accounts.getAccount(accountId);
          if (!account) {
            throw new ExtensionError(`Account not found: ${accountId}`);
          }
          for (let identity of account.identities) {
            if (identity.key == identityId) {
              account.defaultIdentity = identity;
              return;
            }
          }
          throw new ExtensionError(
            `Identity ${identityId} not found for ${accountId}`
          );
        },
      },
    };
  }
};

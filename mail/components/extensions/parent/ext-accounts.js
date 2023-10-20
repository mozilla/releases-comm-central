/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

var { convertAccount, convertMailIdentity } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

/**
 * @implements {nsIObserver}
 * @implements {nsIMsgFolderListener}
 */
var accountsTracker = new (class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.monitoredAccounts = new Map();

    // Keep track of accounts data monitored for changes.
    for (let nativeAccount of MailServices.accounts.accounts) {
      this.monitoredAccounts.set(
        nativeAccount.key,
        this.getMonitoredProperties(nativeAccount)
      );
    }
  }

  getMonitoredProperties(nativeAccount) {
    return {
      name: nativeAccount.incomingServer.prettyName,
      defaultIdentityKey: nativeAccount.defaultIdentity?.key,
    };
  }

  getChangedMonitoredProperty(nativeAccount, propertyName) {
    if (!nativeAccount || !this.monitoredAccounts.has(nativeAccount.key)) {
      return false;
    }
    let values = this.monitoredAccounts.get(nativeAccount.key);
    let propertyValue =
      this.getMonitoredProperties(nativeAccount)[propertyName];
    if (propertyValue && values[propertyName] != propertyValue) {
      values[propertyName] = propertyValue;
      this.monitoredAccounts.set(nativeAccount.key, values);
      return propertyValue;
    }
    return false;
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      // nsIMsgFolderListener
      MailServices.mfn.addListener(this, MailServices.mfn.folderAdded);
      Services.prefs.addObserver("mail.server.", this);
      Services.prefs.addObserver("mail.account.", this);
      for (let topic of this._notifications) {
        Services.obs.addObserver(this, topic);
      }
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      MailServices.mfn.removeListener(this);
      Services.prefs.removeObserver("mail.server.", this);
      Services.prefs.removeObserver("mail.account.", this);
      for (let topic of this._notifications) {
        Services.obs.removeObserver(this, topic);
      }
    }
  }

  // nsIMsgFolderListener
  folderAdded(folder) {
    // If the account of this folder is unknown, it is new and this is the
    // initial root folder after the account has been created.
    let server = folder.server;
    let nativeAccount = MailServices.accounts.FindAccountForServer(server);
    if (nativeAccount && !this.monitoredAccounts.has(nativeAccount.key)) {
      this.monitoredAccounts.set(
        nativeAccount.key,
        this.getMonitoredProperties(nativeAccount)
      );
      let account = convertAccount(nativeAccount, false);
      this.emit("account-added", nativeAccount.key, account);
    }
  }

  // nsIObserver
  _notifications = ["message-account-removed"];

  async observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed":
        {
          let [, type, key, property] = data.split(".");

          if (type == "server" && property == "name") {
            let server;
            try {
              server = MailServices.accounts.getIncomingServer(key);
            } catch (ex) {
              // Fails for servers being removed.
              return;
            }
            let nativeAccount =
              MailServices.accounts.FindAccountForServer(server);

            let name = this.getChangedMonitoredProperty(nativeAccount, "name");
            if (name) {
              this.emit("account-updated", nativeAccount.key, {
                id: nativeAccount.key,
                name,
              });
            }
          }

          if (type == "account" && property == "identities") {
            let nativeAccount = MailServices.accounts.getAccount(key);

            let defaultIdentityKey = this.getChangedMonitoredProperty(
              nativeAccount,
              "defaultIdentityKey"
            );
            if (defaultIdentityKey) {
              this.emit("account-updated", nativeAccount.key, {
                id: nativeAccount.key,
                defaultIdentity: convertMailIdentity(
                  nativeAccount,
                  nativeAccount.defaultIdentity
                ),
              });
            }
          }
        }
        break;

      case "message-account-removed":
        if (this.monitoredAccounts.has(data)) {
          this.monitoredAccounts.delete(data);
          this.emit("account-removed", data);
        }
        break;
    }
  }
})();

this.accounts = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onCreated({ context, fire }) {
      async function listener(_event, key, account) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(key, account);
      }
      accountsTracker.on("account-added", listener);
      return {
        unregister: () => {
          accountsTracker.off("account-added", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onUpdated({ context, fire }) {
      async function listener(_event, key, changedValues) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(key, changedValues);
      }
      accountsTracker.on("account-updated", listener);
      return {
        unregister: () => {
          accountsTracker.off("account-updated", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onDeleted({ context, fire }) {
      async function listener(_event, key) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(key);
      }
      accountsTracker.on("account-removed", listener);
      return {
        unregister: () => {
          accountsTracker.off("account-removed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  constructor(...args) {
    super(...args);
    accountsTracker.incrementListeners();
  }

  onShutdown() {
    accountsTracker.decrementListeners();
  }

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
        onCreated: new EventManager({
          context,
          module: "accounts",
          event: "onCreated",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "accounts",
          event: "onUpdated",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "accounts",
          event: "onDeleted",
          extensionApi: this,
        }).api(),
      },
    };
  }
};

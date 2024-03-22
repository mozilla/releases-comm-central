/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

export var allContacts = {};
export var onlineContacts = {};

export var ChatCore = {
  initialized: false,
  _initializing: false,
  init() {
    if (this._initializing) {
      return;
    }
    this._initializing = true;

    Services.obs.addObserver(this, "browser-request");
    Services.obs.addObserver(this, "contact-signed-on");
    Services.obs.addObserver(this, "contact-signed-off");
    Services.obs.addObserver(this, "contact-added");
    Services.obs.addObserver(this, "contact-removed");
  },
  idleStart() {
    IMServices.core.init();

    // Find the accounts that exist in the im account service but
    // not in nsMsgAccountManager. They have probably been lost if
    // the user has used an older version of Thunderbird on a
    // profile with IM accounts. See bug 736035.
    const accountsById = {};
    for (const account of IMServices.accounts.getAccounts()) {
      accountsById[account.numericId] = account;
    }
    for (const account of MailServices.accounts.accounts) {
      const incomingServer = account.incomingServer;
      if (!incomingServer || incomingServer.type != "im") {
        continue;
      }
      delete accountsById[incomingServer.wrappedJSObject.imAccount.numericId];
    }
    // Let's recreate each of them...
    for (const id in accountsById) {
      const account = accountsById[id];
      const inServer = MailServices.accounts.createIncomingServer(
        account.name,
        account.protocol.id, // hostname
        "im"
      );
      inServer.wrappedJSObject.imAccount = account;
      const acc = MailServices.accounts.createAccount();
      // Avoid new folder notifications.
      inServer.valid = false;
      acc.incomingServer = inServer;
      inServer.valid = true;
      MailServices.accounts.notifyServerLoaded(inServer);
    }

    IMServices.tags.getTags().forEach(function (aTag) {
      aTag.getContacts().forEach(function (aContact) {
        const name = aContact.preferredBuddy.normalizedName;
        allContacts[name] = aContact;
      });
    });

    ChatCore.initialized = true;
    Services.obs.notifyObservers(null, "chat-core-initialized");
    ChatCore._initializing = false;
  },
  observe(aSubject, aTopic) {
    if (aTopic == "browser-request") {
      Services.ww.openWindow(
        null,
        "chrome://messenger/content/browserRequest.xhtml",
        null,
        "chrome,private,centerscreen,width=980,height=750",
        aSubject
      );
      return;
    }

    if (aTopic == "contact-signed-on") {
      onlineContacts[aSubject.preferredBuddy.normalizedName] = aSubject;
      return;
    }

    if (aTopic == "contact-signed-off") {
      delete onlineContacts[aSubject.preferredBuddy.normalizedName];
      return;
    }

    if (aTopic == "contact-added") {
      allContacts[aSubject.preferredBuddy.normalizedName] = aSubject;
      return;
    }

    if (aTopic == "contact-removed") {
      delete allContacts[aSubject.preferredBuddy.normalizedName];
    }
  },
};

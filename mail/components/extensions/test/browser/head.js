/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");

function createAccount() {
  registerCleanupFunction(() => {
    [...MailServices.accounts.accounts.enumerate()].forEach(cleanUpAccount);
  });

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts.enumerate().getNext();
  info(`Created account ${account.toString()}`);

  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeIncomingServer(account.incomingServer, true);
  MailServices.accounts.removeAccount(account, true);
}

function addIdentity(account) {
  let identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  info(`Created identity ${identity.toString()}`);
}

function createMessages(folder, count) {
  const {
    MessageGenerator,
  } = ChromeUtils.import("resource://testing-common/mailnews/messageGenerator.js", null);
  let messages = new MessageGenerator().makeMessages({ count });
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings.length, messageStrings);
}

async function promiseAnimationFrame(win = window) {
  await new Promise(win.requestAnimationFrame);
  // dispatchToMainThread throws if used as the first argument of Promise.
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

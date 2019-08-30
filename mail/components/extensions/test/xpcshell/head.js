/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

var { AddonTestUtils } = ChromeUtils.import(
  "resource://testing-common/AddonTestUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

// Windows (Outlook Express) Address Book deactivation. (Bug 448859)
Services.prefs.deleteBranch("ldap_2.servers.oe.");

// OSX Address Book deactivation (Bug 955842)
Services.prefs.deleteBranch("ldap_2.servers.osx.");

var createHttpServer = (...args) => {
  AddonTestUtils.maybeInit(this);
  return AddonTestUtils.createHttpServer(...args);
};

function createAccount() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts
    .enumerate()
    .getNext()
    .QueryInterface(Ci.nsIMsgAccount);
  account.incomingServer = MailServices.accounts.localFoldersServer;
  info(`Created account ${account.toString()}`);

  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

registerCleanupFunction(() => {
  [...MailServices.accounts.accounts.enumerate()].forEach(cleanUpAccount);
});

function addIdentity(account, email = "xpcshell@localhost") {
  let identity = MailServices.accounts.createIdentity();
  identity.email = email;
  account.addIdentity(identity);
  if (!account.defaultIdentity) {
    account.defaultIdentity = identity;
  }
  info(`Created identity ${identity.toString()}`);
}

function createMessages(folder, count) {
  const { MessageGenerator } = ChromeUtils.import(
    "resource://testing-common/mailnews/messageGenerator.js"
  );
  let messages = new MessageGenerator().makeMessages({
    count,
    age_incr: { days: 2 },
  });
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings.length, messageStrings);
  folder.callFilterPlugins(null);
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AddonTestUtils } = ChromeUtils.import(
  "resource://testing-common/AddonTestUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var createHttpServer = (...args) => {
  AddonTestUtils.maybeInit(this);
  return AddonTestUtils.createHttpServer(...args);
};

function createAccount() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.incomingServer = MailServices.accounts.localFoldersServer;
  info(`Created account ${account.toString()}`);

  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

registerCleanupFunction(() => {
  MailServices.accounts.accounts.forEach(cleanUpAccount);
});

function addIdentity(account, email = "xpcshell@localhost") {
  let identity = MailServices.accounts.createIdentity();
  identity.email = email;
  account.addIdentity(identity);
  if (!account.defaultIdentity) {
    account.defaultIdentity = identity;
  }
  info(`Created identity ${identity.toString()}`);
  return identity;
}

function createMessages(folder, count) {
  const { MessageGenerator } = ChromeUtils.import(
    "resource://testing-common/mailnews/MessageGenerator.jsm"
  );
  if (!createMessages.messageGenerator) {
    createMessages.messageGenerator = new MessageGenerator();
  }
  let messages = createMessages.messageGenerator.makeMessages({
    count,
    age_incr: { days: 2 },
  });
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
  folder.callFilterPlugins(null);
}

async function getUtilsJS() {
  let contents = await OS.File.read(do_get_file("data/utils.js").path);
  return new TextDecoder().decode(contents);
}

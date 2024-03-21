/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(async function () {
  const gAccount = createAccount();
  addIdentity(gAccount);
  const rootFolder = gAccount.incomingServer.rootFolder;

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(rootFolder.URI);
  await new Promise(resolve => executeSoon(resolve));
});

function createAccount() {
  registerCleanupFunction(() => {
    MailServices.accounts.accounts.forEach(cleanUpAccount);
  });

  const account = MailServices.accounts.createLocalMailAccount();
  info(`Created account ${account.toString()}`);

  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

function addIdentity(account) {
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  info(`Created identity ${identity.toString()}`);
}

async function promiseAnimationFrame(win = window) {
  await new Promise(win.requestAnimationFrame);
  // dispatchToMainThread throws if used as the first argument of Promise.
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

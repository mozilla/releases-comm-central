/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(localAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function () {
  const tabInfo = window.openContentTab("about:accountsettings");
  await TestUtils.waitForCondition(
    () => tabInfo.pageLoaded && !tabInfo.busy,
    "waiting for account settings tab to load"
  );
  await SimpleTest.promiseFocus(tabInfo.browser);
  const { contentWindow: win, contentDocument: doc } = tabInfo.browser;

  let accounts = MailServices.accounts.accounts;
  Assert.equal(accounts.length, 1, "there should be one account at the start");

  let logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "there should be no logins at the start");

  const accountTree = doc.getElementById("accounttree");
  Assert.equal(
    accountTree.rows.length,
    4,
    "there should be four account tree rows at the start"
  );

  // Click the Add Account button and select Chat Account.

  const wizardPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/chat/imAccountWizard.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("accountTreeCreateAccount"),
    {},
    win
  );
  const popup = doc.getElementById("accountAddPopup");
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.activateItem(doc.getElementById("accountActionsAddChatAccount"));

  // Fill in the account wizard.

  await handleWizard(await wizardPromise);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  await SimpleTest.promiseFocus(win);

  // Check the created account.

  accounts = MailServices.accounts.accounts;
  Assert.equal(accounts.length, 2, "there should now be two accounts");
  Assert.equal(
    accounts[0].incomingServer.type,
    "im",
    "the new account should have the correct type"
  );
  Assert.equal(
    accounts[0].incomingServer.prettyName,
    "Mochitest - me@here",
    "the new account should be named correctly"
  );

  logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should now be a saved login");
  Assert.equal(
    logins[0].hostname,
    "im://prpl-mochitest",
    "the login should have the correct hostname"
  );
  Assert.equal(
    logins[0].username,
    "me@here",
    "the login should have the correct username"
  );
  Assert.equal(
    logins[0].password,
    "password",
    "the login should have the correct password"
  );

  // Check the UI was updated to display the account.

  Assert.equal(
    accountTree.rows.length,
    5,
    "there should be a new account tree row"
  );
  Assert.equal(
    accountTree.rows[0].querySelector(".name").textContent,
    "Mochitest - me@here",
    "the new account tree row should be named correctly"
  );
  Assert.equal(
    accountTree.selectedIndex,
    0,
    "the new account tree row should be selected"
  );

  const contentFrame = doc.getElementById("contentFrame");
  await TestUtils.waitForCondition(
    () => contentFrame.contentDocument.readyState == "complete",
    "waiting for account pane to load"
  );
  Assert.equal(
    contentFrame.contentDocument.documentURI,
    "chrome://messenger/content/am-im.xhtml",
    "the correct account pane should be loaded"
  );

  // Click to remove the account. Handle the removal dialog.

  const removePromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/removeAccount.xhtml",
    { isSubDialog: true }
  );
  EventUtils.synthesizeMouseAtCenter(
    contentFrame.contentDocument.getElementById("deleteAccount"),
    {},
    contentFrame.contentWindow
  );
  await handleRemoveAccount(await removePromise);

  // Check the account was successfully removed.

  accounts = MailServices.accounts.accounts;
  Assert.equal(accounts.length, 1, "the account should have been removed");
  logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "the login should have been removed");

  // Check the UI was updated.

  Assert.equal(
    accountTree.rows.length,
    4,
    "the account tree row should have been removed"
  );
  Assert.equal(
    accountTree.selectedIndex,
    0,
    "the next account tree row should have been selected"
  );
  Assert.equal(
    contentFrame.contentDocument.documentURI,
    "chrome://messenger/content/am-serverwithnoidentities.xhtml",
    "the correct account pane should be loaded"
  );
});

async function handleWizard(win) {
  info("chat account wizard opened");
  await SimpleTest.promiseFocus(win);
  const doc = win.document;
  const wizard = doc.querySelector("wizard");

  const list = doc.getElementById("protolist");
  list.selectedItem = list.itemChildren.find(i => i.value == "prpl-mochitest");
  EventUtils.synthesizeMouseAtCenter(wizard.getButton("next"), {}, win);

  doc.getElementById("name").select();
  EventUtils.sendString("me", win);
  doc.getElementById("username-split-0").select();
  EventUtils.sendString("here", win);
  EventUtils.synthesizeMouseAtCenter(wizard.getButton("next"), {}, win);

  doc.getElementById("password").select();
  EventUtils.sendString("password", win);
  EventUtils.synthesizeMouseAtCenter(wizard.getButton("next"), {}, win);

  EventUtils.synthesizeMouseAtCenter(wizard.getButton("next"), {}, win);

  doc.getElementById("connectNow").checked = false;
  EventUtils.synthesizeMouseAtCenter(wizard.getButton("finish"), {}, win);

  await BrowserTestUtils.windowClosed(win);
  info("chat account wizard closed");
}

async function handleRemoveAccount(win) {
  info("remove account dialog opened");
  await TestUtils.waitForCondition(
    () => win.document.readyState == "complete",
    "waiting for remove account dialog to load"
  );
  const dialog = win.document.querySelector("dialog");

  // Delay here to catch bug 2046647.
  await new Promise(resolve => win.setTimeout(resolve, 100));
  EventUtils.synthesizeMouseAtCenter(dialog.getButton("accept"), {}, win);
  await new Promise(resolve => win.setTimeout(resolve, 100));
  EventUtils.synthesizeMouseAtCenter(dialog.getButton("accept"), {}, win);
  info("remove account dialog closed");
}

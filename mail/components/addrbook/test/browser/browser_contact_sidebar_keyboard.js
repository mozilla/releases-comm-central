/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
("use strict");
let book1, book2;

add_setup(async function () {
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;

  book1 = createAddressBook("Book 1");
  book1.addCard(createContact("daniel", "test"));
  book1.addCard(createContact("jonathan", "test"));
  book1.addCard(createContact("năthån", "test"));

  book2 = createAddressBook("Book 2");
  book2.addCard(createContact("danielle", "test"));
  book2.addCard(createContact("katherine", "test"));
  book2.addCard(createContact("natalie", "test"));
  book2.addCard(createContact("sūsãnáh", "test"));

  const list = createMailingList("pèóplë named tēst");
  book2.addMailList(list);

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(account, true);
    await promiseDirectoryRemoved(book1.URI);
    await promiseDirectoryRemoved(book2.URI);
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  });
});

/**
 * Check all of the things in the sidebar.
 */
add_task(async function testSidebar() {
  // Open a compose window.

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");

  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == composeWindow,
    "waiting for compose window to be active"
  );
  let composeDocument = composeWindow.document;

  // Make sure the contacts sidebar is open.
  let sidebar = composeDocument.getElementById("contactsSidebar");
  if (BrowserTestUtils.isHidden(sidebar)) {
    EventUtils.synthesizeKey("KEY_F9", {}, composeWindow);
  }

  // Close once we have the sidebar open.
  let closePromise = BrowserTestUtils.windowClosed(composeWindow);
  composeWindow.goDoCommand("cmd_close");
  await closePromise;

  // Open the compose window again.
  composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");

  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == composeWindow,
    "waiting for compose window to be active"
  );
  composeDocument = composeWindow.document;

  // The compose window waits before deciding whether to open the sidebar.
  // We must wait longer.
  await new Promise(resolve => composeWindow.setTimeout(resolve, 100));

  // Make sure the contacts sidebar is open when we reopen the compose window.
  sidebar = composeDocument.getElementById("contactsSidebar");
  const toAddrRow = composeDocument.getElementById("addressRowTo");

  // Did the sidebar open when we reopened the compose window?
  Assert.ok(
    !sidebar.isHidden,
    "contactsSidebar is shown when reopening compose window"
  );

  composeDocument = composeWindow.document;

  // We need some more space for the sidebar.
  composeWindow.resizeBy(200, 0);

  // We need a bigger sidebar.
  composeDocument.getElementById("contactsSplitter").width = 300;
  const sidebarBrowser = composeDocument.getElementById("contactsBrowser");
  await TestUtils.waitForCondition(
    () =>
      sidebarBrowser.currentURI.spec.includes("abContactsPanel.xhtml") &&
      sidebarBrowser.contentDocument.readyState == "complete",
    "waiting for sidebar to be fully loaded"
  );

  const sidebarDocument = sidebarBrowser.contentDocument;
  const cardsList = sidebarDocument.getElementById("abResultsTree");
  const toButton = sidebarDocument.getElementById("toButton");
  const ccButton = sidebarDocument.getElementById("ccButton");
  const bccButton = sidebarDocument.getElementById("bccButton");

  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 0,
    "waiting for cards list to load"
  );

  checkListNames(
    [
      "daniel test",
      "danielle test",
      "jonathan test",
      "katherine test",
      "natalie test",
      "năthån test",
      "pèóplë named tēst",
      "sūsãnáh test",
    ],
    "all contacts are shown"
  );

  function checkListNames(expectedNames, message) {
    const actualNames = [];
    for (let row = 0; row < cardsList.view.rowCount; row++) {
      actualNames.push(cardsList.view.getCellText(row, "GeneratedName"));
    }

    Assert.deepEqual(actualNames, expectedNames, message);
  }

  // Check that the buttons are disabled when no contact is selected.
  Assert.equal(cardsList.view.selection.count, 0, "no contact selected");
  Assert.ok(toButton.disabled, "to button disabled with no contact selected");
  Assert.ok(ccButton.disabled, "cc button disabled with no contact selected");
  Assert.ok(bccButton.disabled, "bcc button disabled with no contact selected");

  // Select a contact via the keyboard (5 back tabs then down) and check that the buttons are enabled. Bug 1912727
  for (let i = 0; i < 5; i++) {
    EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, composeWindow);
  }
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, composeWindow);

  // Wait for the selection to be updated.
  await TestUtils.waitForCondition(
    () => cardsList.view.selection.count != 0,
    "waiting for cards list to be selected"
  );
  Assert.equal(cardsList.view.selection.count, 1, "contact selected");

  // Wait for the buttons to be enabled.
  await TestUtils.waitForCondition(
    () => !toButton.disabled,
    "waiting for To button to become enabled"
  );
  Assert.ok(!toButton.disabled, "to button enabled with contact selected");
  Assert.ok(!ccButton.disabled, "cc button enabled with contact selected");
  Assert.ok(!bccButton.disabled, "bcc button enabled with contact selected");

  // Tab down to the To button and press enter to add the contact to the To field.
  EventUtils.synthesizeKey("KEY_Tab", {}, composeWindow);

  // Wait for the To buttons to receive focus.
  await TestUtils.waitForCondition(
    () => sidebarDocument.activeElement === toButton,
    "waiting for To button to receive focus"
  );
  EventUtils.synthesizeKey(" ", {}, composeWindow);

  // Check that the first contact was added to the To field.
  checkPills(toAddrRow, ["danielle test <danielle.test@invalid>"]);

  function checkPills(row, expectedPills) {
    const actualPills = Array.from(
      row.querySelectorAll("mail-address-pill"),
      p => p.label
    );
    Assert.deepEqual(
      actualPills,
      expectedPills,
      "message recipients match expected"
    );
  }

  // Close the compose window and hit the discard prompt.
  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  closePromise = BrowserTestUtils.windowClosed(composeWindow);
  composeWindow.goDoCommand("cmd_close");
  await promptPromise;
  await closePromise;
});

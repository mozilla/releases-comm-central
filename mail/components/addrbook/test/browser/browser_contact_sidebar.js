/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

// No nsIDragService in headless gtk. See bug 1806870.
var dragService =
  !Services.env.get("MOZ_HEADLESS") || AppConstants.platform != "linux"
    ? Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService)
    : null;

add_task(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  const book1 = createAddressBook("Book 1");
  book1.addCard(createContact("daniel", "test"));
  book1.addCard(createContact("jonathan", "test"));
  book1.addCard(createContact("năthån", "test"));

  const book2 = createAddressBook("Book 2");
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
  });

  // Open a compose window.

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == composeWindow
  );
  const composeDocument = composeWindow.document;
  const toAddrInput = composeDocument.getElementById("toAddrInput");
  const toAddrRow = composeDocument.getElementById("addressRowTo");
  const ccAddrInput = composeDocument.getElementById("ccAddrInput");
  const ccAddrRow = composeDocument.getElementById("addressRowCc");
  const bccAddrInput = composeDocument.getElementById("bccAddrInput");
  const bccAddrRow = composeDocument.getElementById("addressRowBcc");

  // The compose window waits before deciding whether to open the sidebar.
  // We must wait longer.
  await new Promise(resolve => composeWindow.setTimeout(resolve, 100));

  // Make sure the contacts sidebar is open.

  const sidebar = composeDocument.getElementById("contactsSidebar");
  if (BrowserTestUtils.isHidden(sidebar)) {
    EventUtils.synthesizeKey("KEY_F9", {}, composeWindow);
  }
  const sidebarBrowser = composeDocument.getElementById("contactsBrowser");
  await TestUtils.waitForCondition(
    () =>
      sidebarBrowser.currentURI.spec.includes("abContactsPanel.xhtml") &&
      sidebarBrowser.contentDocument.readyState == "complete"
  );
  const sidebarWindow = sidebarBrowser.contentWindow;
  const sidebarDocument = sidebarBrowser.contentDocument;

  const abList = sidebarDocument.getElementById("addressbookList");
  const searchBox = sidebarDocument.getElementById("peopleSearchInput");
  const cardsList = sidebarDocument.getElementById("abResultsTree");
  const cardsContext = sidebarDocument.getElementById("cardProperties");
  const toButton = sidebarDocument.getElementById("toButton");
  const ccButton = sidebarDocument.getElementById("ccButton");
  const bccButton = sidebarDocument.getElementById("bccButton");

  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 0);
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

  Assert.equal(cardsList.view.selection.count, 0, "no contact selected");
  Assert.ok(toButton.disabled, "to button disabled with no contact selected");
  Assert.ok(ccButton.disabled, "cc button disabled with no contact selected");
  Assert.ok(bccButton.disabled, "bcc button disabled with no contact selected");

  function clickOnRow(row, event) {
    mailTestUtils.treeClick(
      EventUtils,
      sidebarWindow,
      cardsList,
      row,
      0,
      event
    );
  }

  async function doMenulist(value) {
    const shownPromise = BrowserTestUtils.waitForEvent(abList, "popupshown");
    EventUtils.synthesizeMouseAtCenter(abList, {}, sidebarWindow);
    await shownPromise;
    const hiddenPromise = BrowserTestUtils.waitForEvent(abList, "popuphidden");
    EventUtils.synthesizeMouseAtCenter(
      abList.querySelector(`[value="${value}"]`),
      {},
      sidebarWindow
    );
    await hiddenPromise;
  }

  async function doContextMenu(row, command) {
    clickOnRow(row, {});
    const shownPromise = BrowserTestUtils.waitForEvent(
      cardsContext,
      "popupshown"
    );
    clickOnRow(row, { type: "contextmenu" });
    await shownPromise;
    const hiddenPromise = BrowserTestUtils.waitForEvent(
      cardsContext,
      "popuphidden"
    );
    cardsContext.activateItem(
      cardsContext.querySelector(`[command="${command}"]`)
    );
    await hiddenPromise;
  }

  function checkListNames(expectedNames, message) {
    const actualNames = [];
    for (let row = 0; row < cardsList.view.rowCount; row++) {
      actualNames.push(
        cardsList.view.getCellText(row, cardsList.columns.GeneratedName)
      );
    }

    Assert.deepEqual(actualNames, expectedNames, message);
  }

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

  function clearPills() {
    for (const input of [toAddrInput, ccAddrInput, bccAddrInput]) {
      EventUtils.synthesizeMouseAtCenter(input, {}, composeWindow);
      EventUtils.synthesizeKey(
        "a",
        {
          accelKey: AppConstants.platform == "macosx",
          ctrlKey: AppConstants.platform != "macosx",
        },
        composeWindow
      );
      EventUtils.synthesizeKey("KEY_Delete", {}, composeWindow);
    }
    checkPills(toAddrRow, []);
    checkPills(ccAddrRow, []);
    checkPills(bccAddrRow, []);
  }

  async function inABEditingMode() {
    const topWindow = Services.wm.getMostRecentWindow("mail:3pane");
    const abWindow = await topWindow.toAddressBook();
    await new Promise(resolve => abWindow.setTimeout(resolve));
    await TestUtils.waitForCondition(
      () => abWindow.detailsPane.isEditing,
      "entering editing mode"
    );
    const tabmail = topWindow.document.getElementById("tabmail");
    const tab = tabmail.tabInfo.find(
      t => t.browser?.currentURI.spec == "about:addressbook"
    );
    tabmail.closeTab(tab);
  }

  /**
   * Make sure the "edit contact" menuitem only shows up for the correct
   * contacts, and it properly opens the address book tab.
   *
   * @param {int} row - The row index to activate.
   * @param {boolean} isEditable - If the selected contact should be editable.
   */
  async function checkEditContact(row, isEditable) {
    clickOnRow(row, {});
    const shownPromise = BrowserTestUtils.waitForEvent(
      cardsContext,
      "popupshown"
    );
    clickOnRow(row, { type: "contextmenu" });
    await shownPromise;

    const hiddenPromise = BrowserTestUtils.waitForEvent(
      cardsContext,
      "popuphidden"
    );

    Assert.equal(
      cardsContext.querySelector("#abContextBeforeEditContact").hidden,
      !isEditable
    );
    Assert.equal(
      cardsContext.querySelector("#abContextEditContact").hidden,
      !isEditable
    );

    // If it's an editable row, we should see the edit contact menu items.
    if (isEditable) {
      cardsContext.activateItem(
        cardsContext.querySelector("#abContextEditContact")
      );
      await hiddenPromise;
      await inABEditingMode();
      composeWindow.focus();
      await TestUtils.waitForCondition(
        () => Services.focus.activeWindow == composeWindow
      );
    } else {
      cardsContext.activateItem(
        cardsContext.querySelector(`[command="cmd_addrBcc"]`)
      );
      await hiddenPromise;
    }
  }

  // Click on a contact and make sure is editable.
  await checkEditContact(2, true);
  // Click on a mailing list and make sure is NOT editable.
  await checkEditContact(6, false);

  // Check that the address book picker works.

  await doMenulist(book1.URI);
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 0);
  checkListNames(
    ["daniel test", "jonathan test", "năthån test"],
    "book1 contacts are shown"
  );

  await doMenulist(book2.URI);
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 3);
  checkListNames(
    [
      "danielle test",
      "katherine test",
      "natalie test",
      "pèóplë named tēst",
      "sūsãnáh test",
    ],
    "book2 contacts are shown"
  );

  await doMenulist("moz-abdirectory://?");
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 5);
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

  // Check that the search works.

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, sidebarWindow);

  EventUtils.synthesizeKey("a", { accelKey: true }, sidebarWindow);
  EventUtils.sendString("dan", sidebarWindow);
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 8);
  checkListNames(
    ["daniel test", "danielle test"],
    "matching contacts are shown"
  );

  EventUtils.synthesizeKey("a", { accelKey: true }, sidebarWindow);
  EventUtils.sendString("kat", sidebarWindow);
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 2);
  checkListNames(["katherine test"], "matching contacts are shown");

  EventUtils.synthesizeKey("KEY_Escape", { accelKey: true }, sidebarWindow);
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 1);
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

  // Check that double-clicking works.

  clickOnRow(1, { clickCount: 2 });
  checkPills(toAddrRow, ["danielle test <danielle.test@invalid>"]);

  clickOnRow(3, { clickCount: 2 });
  checkPills(toAddrRow, [
    "danielle test <danielle.test@invalid>",
    "katherine test <katherine.test@invalid>",
  ]);

  clickOnRow(6, { clickCount: 2 });
  checkPills(toAddrRow, [
    "danielle test <danielle.test@invalid>",
    "katherine test <katherine.test@invalid>",
    "pèóplë named tēst <pèóplë named tēst>",
  ]);

  clearPills();

  if (dragService) {
    // Check that drag and drop to the recipients section works.

    clickOnRow(5, {});

    dragService.startDragSessionForTests(
      Ci.nsIDragService.DRAGDROP_ACTION_NONE
    );
    const [result, dataTransfer] = EventUtils.synthesizeDragOver(
      cardsList,
      toAddrInput,
      null,
      null,
      sidebarWindow,
      composeWindow
    );
    EventUtils.synthesizeDropAfterDragOver(
      result,
      dataTransfer,
      toAddrInput,
      composeWindow
    );

    dragService.endDragSession(true);
    checkPills(toAddrRow, ["năthån test <năthån.test@invalid>"]);

    clearPills();
  }

  // Check that the "Add to" buttons work.

  clickOnRow(7, {});

  Assert.ok(!toButton.disabled, "to button enabled with a contact selected");
  Assert.ok(!ccButton.disabled, "cc button enabled with a contact selected");
  Assert.ok(!bccButton.disabled, "bcc button enabled with a contact selected");

  EventUtils.synthesizeMouseAtCenter(toButton, {}, sidebarWindow);
  checkPills(toAddrRow, ["sūsãnáh test <sūsãnáh.test@invalid>"]);

  clickOnRow(0, {});
  EventUtils.synthesizeMouseAtCenter(ccButton, {}, sidebarWindow);
  Assert.ok(BrowserTestUtils.isVisible(ccAddrRow), "cc row visible");
  checkPills(ccAddrRow, ["daniel test <daniel.test@invalid>"]);

  clickOnRow(2, {});
  EventUtils.synthesizeMouseAtCenter(bccButton, {}, sidebarWindow);
  Assert.ok(BrowserTestUtils.isVisible(bccAddrRow), "bcc row visible");
  checkPills(bccAddrRow, ["jonathan test <jonathan.test@invalid>"]);

  clearPills();

  // Check that the context menu works.

  await doContextMenu(7, "cmd_addrTo");
  checkPills(toAddrRow, ["sūsãnáh test <sūsãnáh.test@invalid>"]);

  await doContextMenu(4, "cmd_addrCc");
  checkPills(ccAddrRow, ["natalie test <natalie.test@invalid>"]);

  await doContextMenu(2, "cmd_addrBcc");
  checkPills(bccAddrRow, ["jonathan test <jonathan.test@invalid>"]);

  clearPills();

  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  let deletedPromise = TestUtils.topicObserved(
    "addrbook-contact-deleted",
    c => c.displayName == "daniel test"
  );
  doContextMenu(0, "cmd_delete");
  await promptPromise;
  await deletedPromise;
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 8);
  checkListNames(
    [
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

  // Check that the keyboard commands work.

  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  deletedPromise = TestUtils.topicObserved(
    "addrbook-contact-deleted",
    c => c.displayName == "danielle test"
  );
  clickOnRow(0, {});
  EventUtils.synthesizeKey("KEY_Delete", {}, sidebarWindow);
  await promptPromise;
  await deletedPromise;
  await TestUtils.waitForCondition(() => cardsList.view.rowCount != 7);
  checkListNames(
    [
      "jonathan test",
      "katherine test",
      "natalie test",
      "năthån test",
      "pèóplë named tēst",
      "sūsãnáh test",
    ],
    "all contacts are shown"
  );

  // TODO sidebar context menu

  // Close the compose window and clean up.

  EventUtils.synthesizeKey("KEY_F9", {}, composeWindow);
  await TestUtils.waitForCondition(() => BrowserTestUtils.isHidden(sidebar));

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  const closePromise = BrowserTestUtils.windowClosed(composeWindow);
  composeWindow.goDoCommand("cmd_close");
  await promptPromise;
  await closePromise;
});

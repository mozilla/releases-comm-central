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

var book1, book2;

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

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == composeWindow,
    "waiting for compose window to be active"
  );
  const composeDocument = composeWindow.document;
  const toAddrInput = composeDocument.getElementById("toAddrInput");
  const toAddrRow = composeDocument.getElementById("addressRowTo");
  const ccAddrInput = composeDocument.getElementById("ccAddrInput");
  const ccAddrRow = composeDocument.getElementById("addressRowCc");
  const bccAddrInput = composeDocument.getElementById("bccAddrInput");
  const bccAddrRow = composeDocument.getElementById("addressRowBcc");

  // We need some more space for the sidebar.
  composeWindow.resizeBy(200, 0);
  // The compose window waits before deciding whether to open the sidebar.
  // We must wait longer.
  await new Promise(resolve => composeWindow.setTimeout(resolve, 100));

  // Make sure the contacts sidebar is open.

  const sidebar = composeDocument.getElementById("contactsSidebar");
  if (BrowserTestUtils.isHidden(sidebar)) {
    EventUtils.synthesizeKey("KEY_F9", {}, composeWindow);
  }
  // We need a bigger sidebar.
  composeDocument.getElementById("contactsSplitter").width = 300;
  const sidebarBrowser = composeDocument.getElementById("contactsBrowser");
  await TestUtils.waitForCondition(
    () =>
      sidebarBrowser.currentURI.spec.includes("abContactsPanel.xhtml") &&
      sidebarBrowser.contentDocument.readyState == "complete",
    "waiting for sidebar to be fully loaded"
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

  Assert.equal(cardsList.view.selection.count, 0, "no contact selected");
  Assert.ok(toButton.disabled, "to button disabled with no contact selected");
  Assert.ok(ccButton.disabled, "cc button disabled with no contact selected");
  Assert.ok(bccButton.disabled, "bcc button disabled with no contact selected");

  function clickOnRow(row, event) {
    EventUtils.synthesizeMouseAtCenter(
      cardsList.getRowAtIndex(row),
      event,
      sidebarWindow
    );
  }

  async function changeDirectory(value) {
    EventUtils.synthesizeMouseAtCenter(abList, {}, sidebarWindow);
    await BrowserTestUtils.waitForPopupEvent(abList, "shown");
    abList.menupopup.activateItem(abList.querySelector(`[value="${value}"]`));
    await BrowserTestUtils.waitForPopupEvent(abList, "hidden");
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

  async function checkListColumns(expectedColumns, addrbookItemDisabled) {
    const picker = cardsList.querySelector("th:last-child");
    const pickerButton = picker.querySelector("button");
    const pickerPopup = picker.querySelector("menupopup");

    for (const header of cardsList.querySelectorAll("th[id]")) {
      Assert.equal(
        BrowserTestUtils.isVisible(header),
        expectedColumns.includes(header.id),
        `${header.id}column visibility`
      );
    }

    EventUtils.synthesizeMouseAtCenter(pickerButton, {}, sidebarWindow);
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");
    for (const menuitem of pickerPopup.querySelectorAll("menuitem[value]")) {
      Assert.equal(
        menuitem.getAttribute("checked") === "true",
        expectedColumns.includes(menuitem.value),
        `${menuitem.value} checked state`
      );
    }
    Assert.equal(
      pickerPopup.querySelector(`menuitem[value="addrbook"]`).disabled,
      addrbookItemDisabled
    );
    pickerPopup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");
  }

  async function toggleListColumn(columnID) {
    const picker = cardsList.querySelector("th:last-child");
    const pickerButton = picker.querySelector("button");
    const pickerPopup = picker.querySelector("menupopup");

    EventUtils.synthesizeMouseAtCenter(pickerButton, {}, sidebarWindow);
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");

    const pickerItem = pickerPopup.querySelector(
      `menuitem[value="${columnID}"]`
    );
    const visible = pickerItem.getAttribute("checked") === "true";
    pickerPopup.activateItem(pickerItem);
    pickerPopup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");

    if (visible) {
      await TestUtils.waitForCondition(
        () =>
          BrowserTestUtils.isHidden(cardsList.querySelector(`th#${columnID}`)),
        `waiting for ${columnID} to be hidden`
      );
    } else {
      await TestUtils.waitForCondition(
        () =>
          BrowserTestUtils.isVisible(cardsList.querySelector(`th#${columnID}`)),
        `waiting for ${columnID} to be shown`
      );
    }
  }

  function checkListNames(expectedNames, message) {
    const actualNames = [];
    for (let row = 0; row < cardsList.view.rowCount; row++) {
      actualNames.push(cardsList.view.getCellText(row, "GeneratedName"));
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
        () => Services.focus.activeWindow == composeWindow,
        "waiting for compose window to be active"
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

  await changeDirectory(book1.URI);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 0,
    "waiting for list row count to change"
  );
  await checkListColumns(["GeneratedName"], true);
  checkListNames(
    ["daniel test", "jonathan test", "năthån test"],
    "book1 contacts are shown"
  );
  await toggleListColumn("EmailAddresses");

  await changeDirectory("moz-abdirectory://?");
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 3,
    "waiting for list row count to change"
  );
  await checkListColumns(
    ["GeneratedName", "EmailAddresses", "addrbook"],
    false
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

  await changeDirectory(book2.URI);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 7,
    "waiting for list row count to change"
  );
  await checkListColumns(["GeneratedName", "EmailAddresses"], true);
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

  await changeDirectory("moz-abdirectory://?");
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 5,
    "waiting for list row count to change"
  );
  await checkListColumns(
    ["GeneratedName", "EmailAddresses", "addrbook"],
    false
  );
  await toggleListColumn("EmailAddresses");
  await toggleListColumn("addrbook");

  await changeDirectory(book1.URI);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 7,
    "waiting for list row count to change"
  );
  await checkListColumns(["GeneratedName"], true);

  await changeDirectory("moz-abdirectory://?");
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 3,
    "waiting for list row count to change"
  );
  await checkListColumns(["GeneratedName"], false);

  // Check that the search works.

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, sidebarWindow);

  EventUtils.synthesizeKey("a", { accelKey: true }, sidebarWindow);
  EventUtils.sendString("dan", sidebarWindow);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 8,
    "waiting for list row count to change"
  );
  checkListNames(
    ["daniel test", "danielle test"],
    "matching contacts are shown"
  );

  EventUtils.synthesizeKey("a", { accelKey: true }, sidebarWindow);
  EventUtils.sendString("kat", sidebarWindow);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 2,
    "waiting for list row count to change"
  );
  checkListNames(["katherine test"], "matching contacts are shown");

  EventUtils.synthesizeKey("KEY_Escape", { accelKey: true }, sidebarWindow);
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 1,
    "waiting for list row count to change"
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
      sidebarWindow,
      Ci.nsIDragService.DRAGDROP_ACTION_NONE
    );
    const [result, dataTransfer] = EventUtils.synthesizeDragOver(
      cardsList.getRowAtIndex(5),
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

    dragService.getCurrentSession().endDragSession(true);
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
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 8,
    "waiting for list row count to change"
  );
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
  await TestUtils.waitForCondition(
    () => cardsList.view.rowCount != 7,
    "waiting for list row count to change"
  );
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

  // Close the compose window and clean up. Leave the sidebar open.

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  const closePromise = BrowserTestUtils.windowClosed(composeWindow);
  composeWindow.goDoCommand("cmd_close");
  await promptPromise;
  await closePromise;
});

/**
 * Open a new composition window and check that the sidebar is automatically
 * opened and the state of the address book column is remembered.
 */
add_task(async function testReopenedSidebar() {
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
    () => Services.focus.activeWindow == composeWindow,
    "waiting for compose window to be active"
  );
  const composeDocument = composeWindow.document;

  // We need some more space for the sidebar.
  composeWindow.resizeBy(200, 0);
  // The compose window waits before deciding whether to open the sidebar.
  // We must wait longer.
  await new Promise(resolve => composeWindow.setTimeout(resolve, 100));

  // Make sure the contacts sidebar is open.

  const sidebar = composeDocument.getElementById("contactsSidebar");
  Assert.ok(BrowserTestUtils.isVisible(sidebar));
  const sidebarBrowser = composeDocument.getElementById("contactsBrowser");
  await TestUtils.waitForCondition(
    () =>
      sidebarBrowser.currentURI.spec.includes("abContactsPanel.xhtml") &&
      sidebarBrowser.contentDocument.readyState == "complete",
    "waiting for sidebar to be fully loaded"
  );
  const sidebarDocument = sidebarBrowser.contentDocument;
  const cardsList = sidebarDocument.getElementById("abResultsTree");

  Assert.ok(
    BrowserTestUtils.isVisible(cardsList.querySelector("th#GeneratedName")),
    "GeneratedName column visibility"
  );
  Assert.ok(
    !BrowserTestUtils.isVisible(cardsList.querySelector("th#EmailAddresses")),
    "EmailAddresses column visibility"
  );
  Assert.ok(
    !BrowserTestUtils.isVisible(cardsList.querySelector("th#addrbook")),
    "addrbook column visibility"
  );

  // Close the compose window and clean up.

  EventUtils.synthesizeKey("KEY_F9", {}, composeWindow);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(sidebar),
    "waiting for sidebar to be hidden"
  );

  const closePromise = BrowserTestUtils.windowClosed(composeWindow);
  composeWindow.goDoCommand("cmd_close");
  await closePromise;
});

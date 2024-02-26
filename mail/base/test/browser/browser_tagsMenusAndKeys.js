/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the many ways to set and clear tags on messages.
 */

requestLongerTimeout(2);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
  Ci.nsIMsgDBService
);

const knownTags = new Map([
  ["$label1", { label: "Important", color: "#FF0000" }],
  ["$label2", { label: "Work", color: "#FF9900" }],
  ["$label3", { label: "Personal", color: "#009900" }],
  ["$label4", { label: "To Do", color: "#3333FF" }],
  ["$label5", { label: "Later", color: "#993399" }],
]);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let testFolder;

add_setup(async function () {
  const allTags = MailServices.tags.getAllTags();
  Assert.deepEqual(
    allTags.map(t => t.key),
    [...knownTags.keys()],
    "sanity check tag keys"
  );
  Assert.deepEqual(
    allTags.map(t => ({ label: t.tag, color: t.color })),
    [...knownTags.values()],
    "sanity check tag labels"
  );

  // Add some non-default tags. We'll have 9 tags so that the tag added during
  // tests brings the total to 10 and we can check that it isn't given an
  // access key in the menus (as 10 is two digits it can't be an access key).

  MailServices.tags.addTag("black", "#000000", null);
  MailServices.tags.addTag("orange", "#ff6600", null);
  MailServices.tags.addTag("pink!", "#ff33cc", null);
  MailServices.tags.addTag("steelblue", "#4682b4", null);
  knownTags.set("black", { label: "black", color: "#000000" });
  knownTags.set("orange", { label: "orange", color: "#ff6600" });
  knownTags.set("pink!", { label: "pink!", color: "#ff33cc" });
  knownTags.set("steelblue", { label: "steelblue", color: "#4682b4" });

  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  storeState({ mail: ["tag-message"] });
  await stateChange;

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("tagsMenu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    storeState({});
    MailServices.tags.deleteKey("black");
    MailServices.tags.deleteKey("orange");
    MailServices.tags.deleteKey("pink!");
    MailServices.tags.deleteKey("steelblue");
  });
});

/**
 * Tests Tags menu items with a single message selected.
 * @param {nsIMsgDBHdr} message - The message to operate on.
 * @param {Function} openPopupCallback - One of the "open" functions below.
 */
async function subtestSingleMessage(message, openPopupCallback) {
  info("checking the menu with no tags set");

  Assert.equal(message.getStringProperty("keywords"), "");
  let tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, knownTags);
  await promisePopupClosed(tagsPopup);

  testFolder.addKeywordsToMessages([message], "$label1 pink!");
  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, knownTags, ["$label1", "pink!"]);

  info("adding a tag to the message");

  const promptPromise = handleNewTagDialog("test", "#ccff00");
  let changePromise = promiseKeywordsChanged(message);
  tagsPopup.activateItem(tagsPopup.querySelector(`[id$="addNewTag"]`));
  await promptPromise;
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(message.getStringProperty("keywords"), "$label1 pink! test");

  const expectedTags = new Map(knownTags);
  expectedTags.set("test", { label: "test", color: "#ccff00" });
  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, ["$label1", "pink!", "test"]);

  info("setting a tag on the message");

  changePromise = promiseKeywordsChanged(message);
  tagsPopup.activateItem(tagsPopup.querySelector(`[value="$label4"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(
    message.getStringProperty("keywords"),
    "$label1 pink! test $label4"
  );

  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, [
    "$label1",
    "pink!",
    "test",
    "$label4",
  ]);

  info("removing a tag from the message");

  changePromise = promiseKeywordsChanged(message);
  tagsPopup.activateItem(tagsPopup.querySelector(`[value="pink!"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(message.getStringProperty("keywords"), "$label1 test $label4");

  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, ["$label1", "test", "$label4"]);

  info("removing all tags from the message");

  changePromise = promiseKeywordsChanged(message);
  tagsPopup.activateItem(tagsPopup.querySelector(`[id$="tagRemoveAll"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(message.getStringProperty("keywords"), "");
  MailServices.tags.deleteKey("test");

  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, knownTags, []);

  info("opening the tags section of the preferences");

  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  tagsPopup.activateItem(tagsPopup.querySelector(`[id$="manageTags"]`));
  await promisePopupClosed(tagsPopup);
  const {
    detail: { tabInfo },
  } = await tabOpenPromise;
  if (tabInfo.browser.webProgress?.isLoadingDocument) {
    await BrowserTestUtils.browserLoaded(tabInfo.browser);
  }
  Assert.equal(tabInfo.mode.name, "preferencesTab");
  Assert.equal(tabInfo.paneID, "paneGeneral");
  Assert.equal(tabInfo.scrollPaneTo, "tagsCategory");
  tabmail.closeTab(tabInfo);
}

/**
 * Tests Tags menu items with multiple messages selected. Unlike
 * `subtestSingleMessage` this function selects the messages to operate on.
 * @param {Function} openPopupCallback - One of the "open" functions below.
 */
async function subtestMultipleMessages(openPopupCallback) {
  info("selecting multiple messages");

  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndices = [2, 3, 4];

  info("checking the menu with no tags set");

  const messages = about3Pane.gDBView.getSelectedMsgHdrs();
  Assert.equal(messages[0].getStringProperty("keywords"), "");
  Assert.equal(messages[1].getStringProperty("keywords"), "");
  Assert.equal(messages[2].getStringProperty("keywords"), "");
  let tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, knownTags);
  await promisePopupClosed(tagsPopup);

  testFolder.addKeywordsToMessages([messages[0]], "$label2");
  testFolder.addKeywordsToMessages([messages[0], messages[2]], "pink!");
  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, knownTags, ["$label2", "pink!"]);

  info("adding a tag to the messages");

  const promptPromise = handleNewTagDialog("test", "#ccff00");
  let changePromise = promiseKeywordsChanged(messages[2]);
  tagsPopup.activateItem(tagsPopup.querySelector(`[id$="addNewTag"]`));
  await promptPromise;
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(messages[0].getStringProperty("keywords"), "$label2 pink! test");
  Assert.equal(messages[1].getStringProperty("keywords"), "test");
  Assert.equal(messages[2].getStringProperty("keywords"), "pink! test");

  const expectedTags = new Map(knownTags);
  expectedTags.set("test", { label: "test", color: "#ccff00" });
  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, ["$label2", "pink!", "test"]);

  info("setting a tag on the messages");

  changePromise = promiseKeywordsChanged(messages[2]);
  tagsPopup.activateItem(tagsPopup.querySelector(`[value="$label4"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(
    messages[0].getStringProperty("keywords"),
    "$label2 pink! test $label4"
  );
  Assert.equal(messages[1].getStringProperty("keywords"), "test $label4");
  Assert.equal(messages[2].getStringProperty("keywords"), "pink! test $label4");

  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, [
    "$label2",
    "pink!",
    "test",
    "$label4",
  ]);

  info("removing a tag from the messages");

  changePromise = promiseKeywordsChanged(messages[2]);
  tagsPopup.activateItem(tagsPopup.querySelector(`[value="pink!"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(
    messages[0].getStringProperty("keywords"),
    "$label2 test $label4"
  );
  Assert.equal(messages[1].getStringProperty("keywords"), "test $label4");
  Assert.equal(messages[2].getStringProperty("keywords"), "test $label4");

  tagsPopup = await openPopupCallback();
  await checkTagItems(tagsPopup, expectedTags, ["$label2", "test", "$label4"]);

  info("removing all tags from the messages");

  changePromise = promiseKeywordsChanged(messages[2]);
  tagsPopup.activateItem(tagsPopup.querySelector(`[id$="tagRemoveAll"]`));
  await promisePopupClosed(tagsPopup);
  await changePromise;

  Assert.equal(messages[0].getStringProperty("keywords"), "");
  Assert.equal(messages[1].getStringProperty("keywords"), "");
  Assert.equal(messages[2].getStringProperty("keywords"), "");

  MailServices.tags.deleteKey("test");
}

/**
 * Tests key shortcuts to set and clear tags.
 * @param {nsIMsgDBHdr[]} messages - The currently selected messages.
 * @param {Window} win - The window to simulate key presses in.
 */
async function subtestKeys(messages, win) {
  for (const message of messages) {
    Assert.equal(message.getStringProperty("keywords"), "");
  }

  let changePromise = promiseKeywordsChanged(messages.at(-1));
  EventUtils.synthesizeKey("2", {}, win);
  await changePromise;

  for (const message of messages) {
    Assert.equal(
      message.getStringProperty("keywords"),
      "$label2",
      "$label2 should be added"
    );
  }

  changePromise = promiseKeywordsChanged(messages.at(-1));
  EventUtils.synthesizeKey("3", {}, win);
  await changePromise;

  for (const message of messages) {
    Assert.equal(
      message.getStringProperty("keywords"),
      "$label2 $label3",
      "$label3 should be added"
    );
  }

  changePromise = promiseKeywordsChanged(messages.at(-1));
  EventUtils.synthesizeKey("2", {}, win);
  await changePromise;

  for (const message of messages) {
    Assert.equal(
      message.getStringProperty("keywords"),
      "$label3",
      "$label2 should be removed"
    );
  }

  changePromise = promiseKeywordsChanged(messages.at(-1));
  EventUtils.synthesizeKey("3", {}, win);
  await changePromise;

  for (const message of messages) {
    Assert.equal(
      message.getStringProperty("keywords"),
      "",
      "$label3 should be added"
    );
  }
}

add_task(async function testMailContextFromThreadTree() {
  const message = await selectMessageInAbout3Pane();
  await subtestSingleMessage(
    message,
    openMailContextFromThreadTree.bind(undefined, 0)
  );
  await subtestMultipleMessages(
    openMailContextFromThreadTree.bind(undefined, 2)
  );
});

add_task(async function testMailContextFromMessagePane() {
  const message = await selectMessageInAbout3Pane();
  await subtestSingleMessage(message, openMailContextFromMessagePane);
});

add_task(async function testHeaderPopup() {
  const message = await selectMessageInAbout3Pane();
  await subtestSingleMessage(message, openHeaderPopup);
});

add_task(async function testToolbarPopup() {
  const message = await selectMessageInAbout3Pane();
  await subtestSingleMessage(message, openToolbarPopup);
  await subtestMultipleMessages(openToolbarPopup);
});

add_task(async function testMessageMenu() {
  const message = await selectMessageInAbout3Pane();
  await subtestSingleMessage(message, openMessageMenu);
  await subtestMultipleMessages(openMessageMenu);
}).skip(AppConstants.platform == "macosx");

add_task(async function testKeys() {
  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndices = [5, 7];

  info("testing keys with focus on the folder pane");
  about3Pane.folderTree.focus();
  await subtestKeys(about3Pane.gDBView.getSelectedMsgHdrs(), about3Pane);

  info("testing keys with focus on the thread pane");
  about3Pane.threadTree.table.body.focus();
  await subtestKeys(about3Pane.gDBView.getSelectedMsgHdrs(), about3Pane);

  info("testing keys with focus on the message pane");
  await selectMessageInAbout3Pane();
  const messagePaneBrowser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  messagePaneBrowser.focus();
  await subtestKeys(
    about3Pane.gDBView.getSelectedMsgHdrs(),
    messagePaneBrowser.contentWindow
  );
});

add_task(async function testMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  const tab = window.OpenMessageInNewTab(testFolder.messages.getNext(), {
    background: false,
  });
  const { detail: message } = await tabPromise;
  await messageLoadedIn(tab.chromeBrowser);
  await TestUtils.waitForTick();
  info("testing mail context from messagepane");
  await subtestSingleMessage(message, openMailContextFromMessagePane);
  info("testing header popup");
  await subtestSingleMessage(message, openHeaderPopup);
  info("testing toolbar popup");
  await subtestSingleMessage(message, openToolbarPopup);
  if (AppConstants.platform != "macosx") {
    info("testing message menu");
    await subtestSingleMessage(message, openMessageMenu);
  }
  info("testing keys");
  await subtestKeys([message], window);
  tabmail.closeOtherTabs(0);
});

add_task(async function testMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(testFolder.messages.getNext());
  const win = await winPromise;
  const { detail: message } = await BrowserTestUtils.waitForEvent(
    win,
    "MsgLoaded"
  );
  const aboutMessage = win.messageBrowser.contentWindow;
  await messageLoadedIn(win.messageBrowser);
  info("testing mail context from message pane");
  await subtestSingleMessage(
    message,
    openMailContextFromMessagePane.bind(undefined, aboutMessage)
  );
  info("testing header popup");
  await subtestSingleMessage(
    message,
    openHeaderPopup.bind(undefined, aboutMessage)
  );
  info("testing toolbar popup");
  await subtestSingleMessage(message, openToolbarPopup.bind(undefined, win));
  if (AppConstants.platform != "macosx") {
    info("testing message menu");
    await subtestSingleMessage(message, openMessageMenu.bind(undefined, win));
  }
  info("testing keys");
  await subtestKeys([message], win);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Selects the first message in the thread pane and waits for it to load.
 * @returns {nsIMsgDBHdr}
 */
async function selectMessageInAbout3Pane() {
  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndex = 0;
  await messageLoadedIn(about3Pane.messageBrowser);
  return about3Pane.gDBView.hdrForFirstSelectedMessage;
}

/**
 * Open the context menu from the thread pane and the Tags menu within.
 * @param {integer} indexToClick - The index of the row to right-click on.
 * @returns {MozMenuPopup}
 */
async function openMailContextFromThreadTree(indexToClick) {
  const menu = about3Pane.document.getElementById("mailContext");
  const tagsMenu = about3Pane.document.getElementById("mailContext-tags");
  const tagsPopup = tagsMenu.menupopup;
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.threadTree.getRowAtIndex(indexToClick),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  tagsMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(tagsPopup, "shown");
  await TestUtils.waitForTick();
  return tagsPopup;
}

/**
 * Open the context menu from the message pane and the Tags menu within.
 * @param {Window} [aboutMessage] - If not given, the about:message window
 *   from the current tab in the main window.
 * @returns {MozMenuPopup}
 */
async function openMailContextFromMessagePane(
  aboutMessage = tabmail.currentAboutMessage
) {
  const topWindow =
    aboutMessage.parent == aboutMessage.top
      ? aboutMessage
      : aboutMessage.parent;
  const menu = topWindow.document.getElementById("mailContext");
  const tagsMenu = topWindow.document.getElementById("mailContext-tags");
  const tagsPopup = tagsMenu.menupopup;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  tagsMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(tagsPopup, "shown");
  await TestUtils.waitForTick();
  return tagsPopup;
}

/**
 * Open the message header More button and the Tags menu within.
 * @param {Window} [aboutMessage] - If not given, the about:message window
 *   from the current tab in the main window.
 * @returns {MozMenuPopup}
 */
async function openHeaderPopup(aboutMessage = tabmail.currentAboutMessage) {
  const button = aboutMessage.document.getElementById("otherActionsButton");
  const popup = aboutMessage.document.getElementById("otherActionsPopup");
  const tagsMenu = aboutMessage.document.getElementById("otherActionsTag");
  const tagsPopup = tagsMenu.menupopup;
  EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  tagsMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(tagsPopup, "shown");
  await TestUtils.waitForTick();
  return tagsPopup;
}

/**
 * Open the Tags toolbar button popup.
 * @param {Window} [win] - If not given, the main window.
 * @returns {MozMenuPopup}
 */
async function openToolbarPopup(win = window) {
  await SimpleTest.promiseFocus(win);
  const button = win.document.querySelector(
    `#button-tag, #unifiedToolbarContent [item-id="tag-message"]`
  );
  const tagsPopup =
    button.menupopup ?? win.document.getElementById("toolbarTagPopup");
  EventUtils.synthesizeMouseAtCenter(button, {}, win);
  await BrowserTestUtils.waitForPopupEvent(tagsPopup, "shown");
  await TestUtils.waitForTick();
  return tagsPopup;
}

/**
 * Open the menu bar Message menu and the Tags menu within. This must not be
 * called on macOS where the menu bar is inaccessible to tests.
 * @param {Window} [win] - If not given, the main window.
 * @returns {MozMenuPopup}
 */
async function openMessageMenu(win = window) {
  await SimpleTest.promiseFocus(win);
  const menu = win.document.getElementById("messageMenu");
  const tagsMenu = win.document.getElementById("tagMenu");
  const tagsPopup = tagsMenu.menupopup;
  EventUtils.synthesizeMouseAtCenter(menu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  tagsMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(tagsPopup, "shown");
  await TestUtils.waitForTick();
  return tagsPopup;
}

/**
 * Wait for a tags menu, and its parent if there is one, to be closed. If the
 * menu is open, close it.
 * @param {MozMenuPopup} tagsPopup
 */
async function promisePopupClosed(tagsPopup) {
  const parentPopup = tagsPopup.parentNode.closest("menupopup");
  if (tagsPopup.state == "open") {
    tagsPopup.hidePopup();
  }
  if (parentPopup) {
    if (parentPopup.state == "open") {
      parentPopup.hidePopup();
    }
    await BrowserTestUtils.waitForPopupEvent(
      tagsPopup.parentNode.closest("menupopup"),
      "hidden"
    );
  }
  await SimpleTest.promiseFocus(tagsPopup.ownerGlobal.top);
  await TestUtils.waitForTick();
}

/**
 * Check the tag items on a menu are present and correct.
 * @param {MozMenuPopup} tagsPopup
 * @param {Map<string, object>} expectedTags - A map of the tags that should
 *   be present on the menu. An entry's key is the tag key, and its value is
 *   an object containing the tag label and color.
 * @param {string[]} expectedChecked
 */
function checkTagItems(tagsPopup, expectedTags, expectedChecked = []) {
  let index = 0;
  let element = tagsPopup.querySelector("menuseparator:last-of-type");

  for (const [key, { label, color }] of expectedTags) {
    index++;
    element = element.nextElementSibling;
    if (index < 10) {
      Assert.equal(element.accessKey, index, "menu item accessKey");
      Assert.equal(element.label, `${index} ${label}`, "menu item label");
    } else {
      Assert.equal(element.accessKey, "", "menu item accessKey");
      Assert.equal(element.label.trim(), label, "menu item label");
    }
    Assert.equal(element.value, key, "menu item value");
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    Assert.equal(
      element.style.color,
      `rgb(${r}, ${g}, ${b})`,
      "menu item color"
    );
    Assert.equal(
      element.getAttribute("checked") == "true",
      expectedChecked.includes(key),
      "menu item checked state"
    );
  }
  Assert.ok(!element.nextElementSibling, "no more tag menu items");
}

/**
 * Wait for the new tag dialog to show, and fill it in.
 * @param {string} tagToAdd
 * @param {string} colorToUse
 * @returns {Promise} - Resolves when the tag has shown, filled, and closed.
 */
function handleNewTagDialog(tagToAdd, colorToUse) {
  return BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/newTagDialog.xhtml",
    {
      callback(win) {
        const nameInput = win.document.getElementById("name");
        const colorInput = win.document.getElementById("tagColorPicker");
        const acceptButton = win.document
          .querySelector("dialog")
          .getButton("accept");

        Assert.equal(
          win.document.activeElement,
          nameInput,
          "name input has focus"
        );
        Assert.equal(nameInput.value, "", "name input is empty");
        EventUtils.sendString(tagToAdd, win);
        colorInput.value = colorToUse;
        EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
      },
    }
  );
}

/**
 * Wait for a message's tags to change.
 * @param {nsIMsgDBHdr} header
 * @returns {Promise} - Resolves when the header's tags change.
 */
function promiseKeywordsChanged(header) {
  return new Promise(resolve => {
    gDbService.registerPendingListener(testFolder, {
      onHdrFlagsChanged(hdrChanged, oldFlags, newFlags, instigator) {},
      onHdrDeleted(hdrChanged, parentKey, Flags, instigator) {},
      onHdrAdded(hdrChanged, parentKey, flags, instigator) {},
      onParentChanged(keyChanged, oldParent, newParent, instigator) {},
      onAnnouncerGoingAway(instigator) {},
      onReadChanged(instigator) {},
      onJunkScoreChanged(instigator) {},
      onHdrPropertyChanged(
        hdrToChange,
        property,
        preChange,
        status,
        instigator
      ) {
        if (hdrToChange == header) {
          gDbService.unregisterPendingListener(this);
          TestUtils.waitForTick().then(resolve);
        }
      },
      onEvent(db, event) {},
    });
  });
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests fetching new mail from a standalone message window. See
 * browser_getMessages_menus.js for more information.
 */

// Load common setup code shared by the browser_getMessages tests.
Services.scriptloader.loadSubScript(
  new URL("head_getMessages.js", gTestPath).href,
  this
);

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 3 : 2);

/**
 * Tests the "All Accounts" menu item from the File menu and the toolbar of a
 * standalone message window.
 */
add_task(async function testMessageWindowAll() {
  const messageWindow = await openMessageFromFile(
    new FileUtils.File(getTestFilePath("../files/sampleContent.eml"))
  );

  if (AppConstants.platform != "macosx") {
    await subtestFileMenuAll(messageWindow);
  }

  info("clicking the toolbar popup menu item");
  await testAllServers(async function () {
    const button = messageWindow.document.getElementById("button-getmsg");
    EventUtils.synthesizeMouseAtCenter(
      button.querySelector(".toolbarbutton-menubutton-dropmarker"),
      {},
      messageWindow
    );
    await checkPopupItemsAndActivateFirst(button.menupopup, 2);
  });

  await BrowserTestUtils.closeWindow(messageWindow);
  await SimpleTest.promiseFocus(window);
});

/**
 * Tests displaying a message, the File menu "Current Account" menu item, the
 * toolbar button, and pressing F5 in a standalone message window.
 *
 * This test assumes testMessageWindowAll has run and therefore there are
 * messages in each of the folders.
 */
add_task(async function testMessageWindow() {
  const windowsToClose = [];

  try {
    await testEachServer(async function (thisInbox) {
      info("opening a message");
      const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
      window.MsgOpenNewWindowForMessage(thisInbox.messages.getNext());
      const messageWindow = await messageWindowPromise;
      await messageLoadedIn(messageWindow.messageBrowser);
      windowsToClose.push(messageWindow);

      if (thisInbox.server.type != "pop3") {
        // Why don't POP3 folders update when you open them?
        await waitForMessages(thisInbox);
        await addMessagesToServer(thisInbox.server.type);
      }

      if (AppConstants.platform != "macosx") {
        info("clicking the File menu item");
        await subtestFileMenu(messageWindow, thisInbox);
      }

      info("clicking the toolbar button");
      const button = messageWindow.document.getElementById("button-getmsg");
      const popup = button.menupopup;
      EventUtils.synthesizeMouseAtCenter(
        button.querySelector(".toolbarbutton-menubutton-button"),
        {},
        messageWindow
      );

      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);

      info("clicking the toolbar popup menu item");
      EventUtils.synthesizeMouseAtCenter(
        button.querySelector(".toolbarbutton-menubutton-dropmarker"),
        {},
        messageWindow
      );
      await BrowserTestUtils.waitForPopupEvent(popup, "shown");
      for (const menuitem of popup.children) {
        if (menuitem._folder == thisInbox.rootFolder) {
          popup.activateItem(menuitem);
          break;
        }
      }
      await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);

      info("pressing F5");
      EventUtils.synthesizeKey("KEY_F5", {}, messageWindow);
    });
  } finally {
    for (const win of windowsToClose) {
      await BrowserTestUtils.closeWindow(win);
    }
    await SimpleTest.promiseFocus(window);
  }
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests fetching new mail by displaying a folder or an account in the 3-pane
 * tab. See browser_getMessages_menus.js for more information.
 */

// Load common setup code shared by the browser_getMessages tests.
Services.scriptloader.loadSubScript(
  new URL("head_getMessages.js", gTestPath).href,
  this
);

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 3 : 2);

/**
 * Tests displaying a folder, clicking the Folder Pane header button, the File
 * menu "Current Account" menu item, and pressing F5. All of these things are
 * tested together because the act of displaying a folder fetches new mail.
 */
add_task(async function testInFolder() {
  await testEachServer(async function (thisInbox) {
    info("displaying the folder");
    about3Pane.displayFolder(thisInbox);
    if (thisInbox.server.type != "pop3") {
      // Why don't POP3 folders update when you open them?
      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);
    }

    info("clicking the Folder Pane header button");
    EventUtils.synthesizeMouseAtCenter(getMessagesButton, {}, about3Pane);
    await waitForMessages(thisInbox);
    await addMessagesToServer(thisInbox.server.type);

    if (AppConstants.platform != "macosx") {
      info("clicking the File menu item");
      await subtestFileMenu(window, thisInbox);
    }

    info("pressing F5");
    EventUtils.synthesizeKey("KEY_F5", {});
  });
  about3Pane.displayFolder(localRootFolder);
});

/**
 * Tests the "Read messages" button in Account Central.
 */
add_task(async function testAccountCentral() {
  await testEachServer(async function (thisInbox) {
    about3Pane.displayFolder(thisInbox.rootFolder);
    const accountCentralBrowser = about3Pane.accountCentralBrowser;
    await TestUtils.waitForCondition(
      () =>
        accountCentralBrowser.currentURI.spec.endsWith(
          encodeURIComponent(thisInbox.rootFolder.URI)
        ) && accountCentralBrowser.contentDocument.readyState == "complete",
      "waiting for Account Central to load"
    );
    EventUtils.synthesizeMouseAtCenter(
      accountCentralBrowser.contentDocument.getElementById("readButton"),
      {},
      accountCentralBrowser.contentWindow
    );
    await TestUtils.waitForCondition(
      () => about3Pane.gFolder == thisInbox,
      "waiting for displayed folder to change"
    );
  });
  about3Pane.displayFolder(localRootFolder);
});

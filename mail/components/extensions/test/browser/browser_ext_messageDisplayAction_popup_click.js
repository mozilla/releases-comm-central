/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;
const tabmail = document.getElementById("tabmail");

add_setup(async () => {
  account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;

  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: subFolders[0],
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  info("3-pane tab");
  {
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: tabmail.currentAboutMessage,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });
  }

  info("Message tab");
  {
    await openMessageInTab(messages.getNext());
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: tabmail.currentAboutMessage,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });

    document.getElementById("tabmail").closeTab();
  }

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(messages.getNext());
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: messageWindow.messageBrowser.contentWindow,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });

    messageWindow.close();
  }
});

// This test uses openPopup() to open the popup in a message window.
add_task(async function test_popup_open_with_openPopup_in_message_window() {
  const files = {
    "background.js": async () => {
      const windows = await browser.windows.getAll();
      const mailWindow = windows.find(window => window.type == "normal");
      const messageWindow = windows.find(
        window => window.type == "messageDisplay"
      );
      browser.test.assertTrue(!!mailWindow, "should have found a mailWindow");
      browser.test.assertTrue(
        !!messageWindow,
        "should have found a messageWindow"
      );

      const tabs = await browser.tabs.query({});
      const mailTab = tabs.find(tab => tab.type == "mail");
      browser.test.assertTrue(!!mailTab, "should have found a mailTab");

      const msg = await browser.messageDisplay.getDisplayedMessage(mailTab.id);
      browser.test.assertTrue(!!msg, "should display a message");

      // The test starts with an opened messageWindow, the message_display_action
      // is allowed there and should be visible, openPopup() should succeed.
      browser.test.assertTrue(
        (await browser.windows.get(messageWindow.id)).focused,
        "messageWindow should be focused"
      );
      const popupClosePromise1 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have succeeded while the messageWindow is active"
      );
      await popupClosePromise1;

      // Specifically open the message_display_action of the mailWindow, since we
      // loaded a message, openPopup() should succeed.
      const popupClosePromise2 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup({
          windowId: mailWindow.id,
        }),
        "openPopup() should have succeeded when explicitly requesting the mailWindow"
      );
      await popupClosePromise2;
      // Mail window should have focus now.
      browser.test.assertTrue(
        (await browser.windows.get(mailWindow.id)).focused,
        "mailWindow should be focused"
      );

      // Disable the message_display_action, openPopup() should fail.
      await browser.messageDisplayAction.disable();
      browser.test.assertFalse(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have failed after the action_button was disabled"
      );

      // Enable the message_display_action, openPopup() should succeed.
      await browser.messageDisplayAction.enable();
      const popupClosePromise3 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have succeeded after the action_button was enabled again"
      );
      await popupClosePromise3;

      // Create content tab, the message_display_action is not allowed there and
      // should not be visible, openPopup() should fail.
      const contentTab = await browser.tabs.create({
        url: "https://www.example.com",
      });
      browser.test.assertFalse(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have failed while the content tab is active"
      );

      // Close the content tab and return to the mail space, the message_display_action
      // should be visible again, openPopup() should succeed.
      await browser.tabs.remove(contentTab.id);
      const popupClosePromise4 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have succeeded after the content tab was closed"
      );
      await popupClosePromise4;

      // Load a webpage into the mailTab, the message_display_action should not
      // be shown and openPopup() should fail
      await browser.tabs.update(mailTab.id, { url: "https://www.example.com" });
      browser.test.assertFalse(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have failed while the mail tab shows a webpage"
      );

      // Open a message in a tab, the message_display_action should be shown and
      // openPopup() should succeed.
      const messageTab = await browser.messageDisplay.open({
        active: true,
        location: "tab",
        messageId: msg.id,
        windowId: mailWindow.id,
      });
      const popupClosePromise5 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have succeeded in a message tab"
      );
      await popupClosePromise5;

      // Create a popup window, which does not have a message_display_action, openPopup()
      // should fail.
      const popupWindow = await browser.windows.create({
        type: "popup",
        url: "https://www.example.com",
      });
      browser.test.assertTrue(
        (await browser.windows.get(popupWindow.id)).focused,
        "popupWindow should be focused"
      );
      browser.test.assertFalse(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have failed while the popup window is active"
      );

      // Specifically open the message_display_action of the messageWindow, should become
      // focused and openPopup() should succeed.
      const popupClosePromise6 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup({
          windowId: messageWindow.id,
        }),
        "openPopup() should have succeeded when explicitly requesting the messageWindow"
      );
      await popupClosePromise6;
      browser.test.assertTrue(
        (await browser.windows.get(messageWindow.id)).focused,
        "messageWindow should be focused"
      );

      // The messageWindow is focused now, openPopup() should succeed.
      const popupClosePromise7 = window.waitForMessage("popup closed");
      browser.test.assertTrue(
        await browser.messageDisplayAction.openPopup(),
        "openPopup() should have succeeded while the messageWindow is active"
      );
      await popupClosePromise7;

      // Close the popup window, the extra message tab and finish
      await browser.windows.remove(popupWindow.id);
      await browser.tabs.remove(messageTab.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
    "popup.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Popup</title>
          <meta charset="utf-8">
          <script defer="defer" src="popup.js"></script>
        </head>
        <body>
          <p>Hello</p>
        </body>
      </html>`,
    "popup.js": async function () {
      const [currentTab] = await browser.tabs.query({
        currentWindow: true,
        active: true,
      });
      browser.test.log(
        `windowType: ${currentTab.windowType}, windowId: ${currentTab.windowId}`
      );
      browser.test.sendMessage("popup opened", currentTab.windowId);
    },
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "message_display_action_openPopup@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead"],
      message_display_action: {
        default_title: "default",
        default_popup: "popup.html",
      },
    },
  });

  const messageWindow = await openMessageInWindow(messages.getNext());

  extension.onMessage("popup opened", async windowId => {
    const window = Services.wm.getOuterWindowWithId(windowId);
    console.log(
      `windowtype of container window: ${window.document.documentElement.getAttribute(
        "windowtype"
      )}`
    );
    await closeBrowserAction(extension, window);
    extension.sendMessage("popup closed");
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  messageWindow.close();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gMessages;
var gFolder;
var gAbout3Pane;

add_setup(() => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];

  gAbout3Pane = document.getElementById("tabmail").currentAbout3Pane;
  gAbout3Pane.displayFolder(gFolder);
  gAbout3Pane.threadTree.selectedIndex = 0;
});

add_task(async function test_popup_open_with_openPopup_in_normal_window() {
  const files = {
    "background.js": async () => {
      const windows = await browser.windows.getAll();
      const mailWindow = windows.find(window => window.type == "normal");
      browser.test.assertTrue(!!mailWindow, "should have found a mailWindow");

      async function checkDownArrowKeySelectsNewMessage(expectedSubject) {
        await new Promise(resolve => {
          const listener = (tab, messages) => {
            browser.mailTabs.onSelectedMessagesChanged.removeListener(listener);
            resolve();
          };
          browser.mailTabs.onSelectedMessagesChanged.addListener(listener);
          browser.test.sendMessage("press arrow down");
        });
        const message = (await browser.mailTabs.getSelectedMessages())
          .messages[0];
        browser.test.assertEq(
          expectedSubject,
          message.subject,
          "The correct message should be selected"
        );
      }

      // Initially we should have selected the first message in row #0.
      const message0 = (await browser.mailTabs.getSelectedMessages())
        .messages[0];
      browser.test.assertEq(
        "Red Document Needs Attention",
        message0.subject,
        "The correct message should be selected"
      );

      // Click on row #1, to select the next message and set focus into the message
      // list.
      await new Promise(resolve => {
        const listener = (tab, messages) => {
          browser.mailTabs.onSelectedMessagesChanged.removeListener(listener);
          resolve();
        };
        browser.mailTabs.onSelectedMessagesChanged.addListener(listener);
        browser.test.sendMessage("click on message", "1");
      });
      const message1 = (await browser.mailTabs.getSelectedMessages())
        .messages[0];
      browser.test.assertEq(
        "Tiny Wedding In a Fortnight",
        message1.subject,
        "The correct message should be selected"
      );

      // Press the down arrow to make sure we can select the next message and focus
      // is correctly set.
      await checkDownArrowKeySelectsNewMessage("Huge Shindig Yesterday");

      // Open the browser_action via openPopup() and wait for a click into the
      // popup, which closes the popup again.
      const popupClosePromise1 = window.waitForMessage("popup closed");
      browser.browserAction.openPopup({ windowId: mailWindow.id });
      await popupClosePromise1;
      browser.test.assertTrue(
        (await browser.windows.get(mailWindow.id)).focused,
        "mailWindow should be focused"
      );

      // Press the down arrow again to make sure focus has returned to the message
      // list and we can select the next message.
      await checkDownArrowKeySelectsNewMessage("Small Party Tomorrow");

      // Open the browser_action via a click and wait for a click into the
      // popup, which closes the popup again.
      const popupClosePromise2 = window.waitForMessage("popup closed");
      browser.test.sendMessage(
        "click element in window",
        `.unified-toolbar [extension="browser_action_focus@mochi.test"]`
      );
      await popupClosePromise2;
      browser.test.assertTrue(
        (await browser.windows.get(mailWindow.id)).focused,
        "mailWindow should be focused"
      );

      // Press the down arrow again to make sure focus has returned to the message
      // list and we can select the next message.
      await checkDownArrowKeySelectsNewMessage("Big Meeting Today");

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
          <p id="hello">Hello</p>
        </body>
      </html>`,
    "popup.js": async function () {
      document.addEventListener("click", () => {
        window.close();
      });
      browser.test.sendMessage("popup opened");
    },
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_focus@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead"],
      browser_action: {
        default_title: "default",
        default_popup: "popup.html",
      },
    },
  });

  extension.onMessage("popup opened", async () => {
    // Get the popup and create a Promise for it being hidden.
    const popup = getBrowserActionPopup(extension);
    await BrowserTestUtils.waitForPopupEvent(popup, "shown");
    // Trigger a click in the popup, which should close it again.
    clickElementInActionPopup(extension, "#hello");
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
    extension.sendMessage("popup closed");
  });

  extension.onMessage("click element in window", selector => {
    const element = window.document.querySelector(selector);
    Assert.ok(!!element, `Should find element ${selector}`);
    EventUtils.synthesizeMouseAtCenter(element, {}, window);
  });

  extension.onMessage("click on message", rowNr => {
    const row = gAbout3Pane.document.getElementById(`threadTree-row${rowNr}`);
    Assert.ok(!!row, `Should find row${rowNr}`);
    EventUtils.synthesizeMouseAtCenter(row, {}, gAbout3Pane);
  });

  extension.onMessage("press arrow down", () => {
    EventUtils.synthesizeKey("VK_DOWN");
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

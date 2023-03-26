/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;

add_setup(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  info("3-pane tab");
  {
    let testConfig = {
      actionType: "browser_action",
      testType: "open-with-mouse-click",
      window,
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
    await run_popup_test({
      ...testConfig,
      default_area: "tabstoolbar",
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
      default_area: "tabstoolbar",
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
      default_area: "tabstoolbar",
    });
  }

  info("Message window");
  {
    let messageWindow = await openMessageInWindow(messages.getNext());
    let testConfig = {
      actionType: "browser_action",
      testType: "open-with-mouse-click",
      default_windows: ["messageDisplay"],
      window: messageWindow,
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

// This test uses openPopup to open the popup.
add_task(async function test_popup_open_with_openPopup() {
  let files = {
    "background.js": async () => {
      browser.runtime.onMessage.addListener(msg => {
        if (msg == "from-browser-action-popup") {
          browser.test.notifyPass("finished");
        }
      });
      browser.browserAction.openPopup();
    },
    "popup.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Popup</title>
        </head>
        <body>
          <p>Hello</p>
          <script src="popup.js"></script>
        </body>
      </html>`,
    "popup.js": function() {
      browser.runtime.sendMessage("from-browser-action-popup");
    },
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_openPopup@mochi.test",
        },
      },
      background: { scripts: ["background.js"] },
      browser_action: {
        default_title: "default",
        default_popup: "popup.html",
      },
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

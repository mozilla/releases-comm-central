/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let subFolders;
let messages;

async function showTooltip(elementSelector, tooltip, browser, description) {
  Assert.ok(!!tooltip, "tooltip element should exist");
  tooltip.ownerGlobal.windowUtils.disableNonTestMouseEvents(true);
  try {
    while (tooltip.state != "open") {
      // We first have to click on the element, otherwise a mousemove event will not
      // trigger the tooltip.
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => window.setTimeout(resolve, 125));
      await synthesizeMouseAtCenterAndRetry(
        elementSelector,
        { button: 1 },
        browser
      );

      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => window.setTimeout(resolve, 125));
      await synthesizeMouseAtCenterAndRetry(
        elementSelector,
        { type: "mousemove" },
        browser
      );

      try {
        await TestUtils.waitForCondition(
          () => tooltip.state == "open",
          `Tooltip should have been shown for ${description}`
        );
      } catch (e) {
        console.log(`Tooltip was not shown for ${description}, trying again.`);
      }
    }
  } finally {
    tooltip.ownerGlobal.windowUtils.disableNonTestMouseEvents(false);
  }
}

add_setup(async () => {
  account = createAccount();
  addIdentity(account);
  const rootFolder = account.incomingServer.rootFolder;
  subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  await TestUtils.waitForCondition(
    () => subFolders[0].messages.hasMoreElements(),
    "Messages should be added to folder"
  );
  messages = subFolders[0].messages;

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
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

add_task(async function test_browserAction_in_about3pane() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => window.setTimeout(resolve, 125));
      browser.browserAction.openPopup();
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      browser_action: {
        default_title: "default",
        default_popup: "page.html",
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const popupBrowser = document.querySelector(".webextension-popup-browser");
    const tooltip = document.getElementById("remoteBrowserTooltip");
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "browserAction in about3pane"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_browserAction_in_message_window() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the message window.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.windows.remove(tab.windowId);
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // Open the popup after a message has been displayed.
      browser.messageDisplay.onMessageDisplayed.addListener(
        async (tab, message) => {
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => window.setTimeout(resolve, 125));
          browser.browserAction.openPopup({ windowId: tab.windowId });
        }
      );

      // Open a message in a window.
      const { messages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.messageDisplay.open({
        location: "window",
        messageId: messages[0].id,
      });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "accountsRead"],
      browser_action: {
        default_title: "default",
        default_popup: "page.html",
        default_windows: ["messageDisplay"],
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const messageWindow = Services.wm.getMostRecentWindow("mail:messageWindow");
    const popupBrowser = messageWindow.document.querySelector(
      ".webextension-popup-browser"
    );
    const tooltip = messageWindow.document.getElementById(
      "remoteBrowserTooltip"
    );
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "browserAction in message window"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_composeAction() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the compose window.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.windows.remove(tab.windowId);
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      const composeTab = await browser.compose.beginNew();
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => window.setTimeout(resolve, 125));
      browser.composeAction.openPopup({ windowId: composeTab.windowId });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      compose_action: {
        default_title: "default",
        default_popup: "page.html",
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const popupBrowser = composeWindow.document.querySelector(
      ".webextension-popup-browser"
    );
    const tooltip = composeWindow.document.getElementById(
      "remoteBrowserTooltip"
    );
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "composeAction in compose window"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_messageDisplayAction_in_about3pane() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => window.setTimeout(resolve, 125));
      browser.messageDisplayAction.openPopup();
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "accountsRead"],
      message_display_action: {
        default_title: "default",
        default_popup: "page.html",
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    // The tooltip and the popup panel are defined in the top level messenger
    // window, not in about:message.
    const popupBrowser = document.querySelector(".webextension-popup-browser");
    const tooltip = document.getElementById("remoteBrowserTooltip");
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "messageDisplayAction in about3pane"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_messageDisplayAction_in_message_tab() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the message tab.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // Open the popup after a message has been displayed.
      browser.messageDisplay.onMessageDisplayed.addListener(
        async (tab, message) => {
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => window.setTimeout(resolve, 125));
          browser.messageDisplayAction.openPopup({ windowId: tab.windowId });
        }
      );

      // Open a message in a tab.
      const { messages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.messageDisplay.open({
        location: "tab",
        messageId: messages[0].id,
      });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "accountsRead"],
      message_display_action: {
        default_title: "default",
        default_popup: "page.html",
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    // The tooltip and the popup panel are defined in the top level messenger
    // window, not in about:message.
    const popupBrowser = document.querySelector(".webextension-popup-browser");
    const tooltip = document.getElementById("remoteBrowserTooltip");
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "messageDisplayAction in message tab"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_messageDisplayAction_in_message_window() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the message window.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.windows.remove(tab.windowId);
        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // Open the popup after a message has been displayed.
      browser.messageDisplay.onMessageDisplayed.addListener(
        async (tab, message) => {
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => window.setTimeout(resolve, 125));
          browser.messageDisplayAction.openPopup({ windowId: tab.windowId });
        }
      );

      // Open a message in a window.
      const { messages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.messageDisplay.open({
        location: "window",
        messageId: messages[0].id,
      });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "accountsRead"],
      message_display_action: {
        default_title: "default",
        default_popup: "page.html",
      },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const messageWindow = Services.wm.getMostRecentWindow("mail:messageWindow");
    const popupBrowser = messageWindow.document.querySelector(
      ".webextension-popup-browser"
    );
    const tooltip = messageWindow.document.getElementById(
      "remoteBrowserTooltip"
    );
    await showTooltip(
      "p",
      tooltip,
      popupBrowser,
      "messageDisplayAction in message window"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_extension_window() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the extension window.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.windows.remove(tab.windowId);

        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // Open an extension window.
      browser.windows.create({ type: "popup", url: "page.html" });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const extensionWindow = Services.wm.getMostRecentWindow(
      "mail:extensionPopup"
    );
    const tooltip = extensionWindow.document.getElementById(
      "remoteBrowserTooltip"
    );
    await showTooltip(
      "p",
      tooltip,
      extensionWindow.browser,
      "extension window"
    );
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_extension_tab() {
  const files = {
    "background.js": async () => {
      async function checkTooltip() {
        // Trigger the tooltip and wait for the status.
        const [state] = await window.sendMessage("check tooltip");
        browser.test.assertEq("open", state, "Should find the tooltip open");

        // Close the extension tab.
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        await browser.tabs.remove(tab.id);

        browser.test.notifyPass("finished");
      }

      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message == "page loaded") {
          sendResponse();
          checkTooltip();
        }
      });

      // Open an extension tab.
      browser.tabs.create({ url: "page.html" });
    },
    "page.js": async function () {
      browser.runtime.sendMessage("page loaded");
    },
    "page.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Page</title>
        </head>
        <body>
          <h1>Tooltip test</h1>
          <p title="Tooltip">I am an element with a tooltip</p>
          <script src="page.js"></script>
        </body>
      </html>`,
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("check tooltip", async () => {
    const tooltip = window.document.getElementById("remoteBrowserTooltip");
    const browser = window.gTabmail.currentTabInfo.browser;
    await showTooltip("p", tooltip, browser, "extension tab");
    extension.sendMessage(tooltip.state);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

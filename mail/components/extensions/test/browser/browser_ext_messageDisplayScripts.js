/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account, messages;
let tabmail, about3Pane, messagePane;

add_setup(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("messageDisplayScripts", null);
  let folder = rootFolder.getChildNamed("messageDisplayScripts");
  createMessages(folder, 11);
  messages = [...folder.messages];

  tabmail = document.getElementById("tabmail");
  about3Pane = tabmail.currentTabInfo.chromeBrowser.contentWindow;
  about3Pane.displayFolder(folder.URI);
  messagePane =
    about3Pane.messageBrowser.contentDocument.getElementById("messagepane");
});

async function checkMessageBody(expected, message, browser) {
  if (message && "textContent" in expected) {
    let body = await new Promise(resolve => {
      window.MsgHdrToMimeMessage(message, null, (msgHdr, mimeMessage) => {
        resolve(mimeMessage.parts[0].body);
      });
    });
    // Ignore Windows line-endings, they're not important here.
    body = body.replace(/\r/g, "");
    expected.textContent = body + expected.textContent;
  }
  if (!browser) {
    browser = messagePane;
  }

  await checkContent(browser, expected);
}

/** Tests browser.tabs.insertCSS and browser.tabs.removeCSS. */
add_task(async function testInsertRemoveCSS() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [tab] = await browser.tabs.query({ mailTab: true });
        await window.sendMessage();

        await browser.tabs.insertCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.tabs.removeCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.tabs.insertCSS(tab.id, { file: "test.css" });
        await window.sendMessage();

        await browser.tabs.removeCSS(tab.id, { file: "test.css" });

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesModify"],
    },
  });

  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(messagePane);

  await extension.startup();

  await extension.awaitMessage();
  await checkMessageBody({ backgroundColor: "rgba(0, 0, 0, 0)" }, messages[0]);
  extension.sendMessage();

  await extension.awaitMessage();
  await checkMessageBody({ backgroundColor: "rgb(0, 255, 0)" }, messages[0]);
  extension.sendMessage();

  await extension.awaitMessage();
  await checkMessageBody({ backgroundColor: "rgba(0, 0, 0, 0)" }, messages[0]);
  extension.sendMessage();

  await extension.awaitMessage();
  await checkMessageBody({ backgroundColor: "rgb(0, 128, 0)" }, messages[0]);
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await checkMessageBody({ backgroundColor: "rgba(0, 0, 0, 0)" }, messages[0]);

  await extension.unload();
});

/** Tests browser.tabs.insertCSS fails without the "messagesModify" permission. */
add_task(async function testInsertRemoveCSSNoPermissions() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [tab] = await browser.tabs.query({ mailTab: true });

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, {
            code: "body { background-color: darkred; }",
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, { file: "test.css" }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, {
            file: "test.css",
            matchAboutBlank: true,
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
    },
  });

  about3Pane.threadTree.selectedIndex = 1;
  await awaitBrowserLoaded(messagePane);

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      textContent: "",
    },
    messages[1]
  );

  await extension.unload();
});

/** Tests browser.tabs.executeScript. */
add_task(async function testExecuteScript() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [tab] = await browser.tabs.query({ mailTab: true });
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.setAttribute("foo", "bar");`,
        });
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, { file: "test.js" });

        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.querySelector(".moz-text-flowed").textContent +=
          "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesModify"],
    },
  });

  about3Pane.threadTree.selectedIndex = 2;
  await awaitBrowserLoaded(messagePane);

  await extension.startup();

  await extension.awaitMessage();
  await checkMessageBody({ textContent: "" }, messages[2]);
  extension.sendMessage();

  await extension.awaitMessage();
  await checkMessageBody({ foo: "bar" }, messages[2]);
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await checkMessageBody(
    {
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[2]
  );

  await extension.unload();
});

/** Tests browser.tabs.executeScript fails without the "messagesModify" permission. */
add_task(async function testExecuteScriptNoPermissions() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [tab] = await browser.tabs.query({ mailTab: true });

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, {
            code: `document.body.setAttribute("foo", "bar");`,
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, { file: "test.js" }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, {
            file: "test.js",
            matchAboutBlank: true,
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.querySelector(".moz-text-flowed").textContent +=
          "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
    },
  });

  about3Pane.threadTree.selectedIndex = 3;
  await awaitBrowserLoaded(messagePane);

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkMessageBody({ foo: null, textContent: "" }, messages[3]);

  await extension.unload();
});

/** Tests the messenger alias is available. */
add_task(async function testExecuteScriptAlias() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [tab] = await browser.tabs.query({ mailTab: true });
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.querySelector(".moz-text-flowed").textContent +=
                   messenger.runtime.getManifest().applications.gecko.id;`,
        });

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      applications: { gecko: { id: "message_display_scripts@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesModify"],
    },
  });

  about3Pane.threadTree.selectedIndex = 4;
  await awaitBrowserLoaded(messagePane);

  await extension.startup();

  await extension.awaitMessage();
  await checkMessageBody({ textContent: "" }, messages[4]);
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await checkMessageBody(
    { textContent: "message_display_scripts@mochitest" },
    messages[4]
  );

  await extension.unload();
});

/**
 * Tests browser.messageDisplayScripts.register correctly adds CSS and
 * JavaScript to message display windows. Also tests calling `unregister`
 * on the returned object.
 */
add_task(async function testRegister() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Keep track of registered scrips being executed and ready.
        browser.runtime.onMessage.addListener((message, sender) => {
          if (message == "LOADED") {
            window.sendMessage("ScriptLoaded", sender.tab.id);
          }
        });

        let registeredScript = await browser.messageDisplayScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        browser.test.onMessage.addListener(async (message, data) => {
          switch (message) {
            case "Unregister":
              await registeredScript.unregister();
              browser.test.notifyPass("finished");
              break;

            case "RuntimeMessageTest":
              try {
                browser.test.assertEq(
                  `Received: ${data.tabId}`,
                  await browser.tabs.sendMessage(data.tabId, data.tabId)
                );
              } catch (ex) {
                browser.test.fail(
                  `Failed to send message to messageDisplayScript: ${ex}`
                );
              }
              browser.test.sendMessage("RuntimeMessageTestDone");
              break;
          }
        });

        window.sendMessage("Ready");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.querySelector(".moz-text-flowed").textContent +=
          "Hey look, the script ran!";
        browser.runtime.onMessage.addListener(async message => {
          return `Received: ${message}`;
        });
        browser.runtime.sendMessage("LOADED");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesModify", "<all_urls>"],
    },
  });

  about3Pane.threadTree.selectedIndex = 5;
  await awaitBrowserLoaded(messagePane);

  extension.startup();
  await extension.awaitMessage("Ready");

  // Check a message that was already loaded. This tab has not loaded the
  // registered scripts.
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      textContent: "",
    },
    messages[5]
  );

  // Load a new message and check it is modified.
  let loadPromise = extension.awaitMessage("ScriptLoaded");
  about3Pane.threadTree.selectedIndex = 6;
  let tabId = await loadPromise;

  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6]
  );
  // Check runtime messaging.
  let testDonePromise = extension.awaitMessage("RuntimeMessageTestDone");
  extension.sendMessage("RuntimeMessageTest", { tabId });
  await testDonePromise;

  // Open the message in a new tab.
  loadPromise = extension.awaitMessage("ScriptLoaded");
  let messageTab = await openMessageInTab(messages[6]);
  let messageTabId = await loadPromise;
  Assert.equal(tabmail.tabInfo.length, 2);

  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6],
    messageTab.browser
  );
  // Check runtime messaging.
  testDonePromise = extension.awaitMessage("RuntimeMessageTestDone");
  extension.sendMessage("RuntimeMessageTest", { tabId: messageTabId });
  await testDonePromise;

  // Open a content tab. The CSS and script shouldn't apply.
  let contentTab = window.openContentTab("http://mochi.test:8888/");
  // Let's wait a while and see if anything happens:
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      foo: null,
    },
    undefined,
    contentTab.browser
  );

  // Closing this tab should bring us back to the message in a tab.
  tabmail.closeTab(contentTab);
  Assert.equal(tabmail.currentTabInfo, messageTab);
  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6],
    messageTab.browser
  );
  // Check runtime messaging.
  testDonePromise = extension.awaitMessage("RuntimeMessageTestDone");
  extension.sendMessage("RuntimeMessageTest", { tabId: messageTabId });
  await testDonePromise;

  // Open the message in a new window.
  loadPromise = extension.awaitMessage("ScriptLoaded");
  let newWindow = await openMessageInWindow(messages[7]);
  let newWindowMessagePane = newWindow.getBrowser();
  let windowTabId = await loadPromise;

  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[7],
    newWindowMessagePane
  );
  // Check runtime messaging.
  testDonePromise = extension.awaitMessage("RuntimeMessageTestDone");
  extension.sendMessage("RuntimeMessageTest", { tabId: windowTabId });
  await testDonePromise;

  // Unregister.
  extension.sendMessage("Unregister");
  await extension.awaitFinish("finished");
  await extension.unload();

  // Check the CSS is unloaded from the message in a tab.
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6],
    messageTab.browser
  );

  // Close the new tab.
  tabmail.closeTab(messageTab);

  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6]
  );

  // Check the CSS is unloaded from the message in a window.
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[7],
    newWindowMessagePane
  );

  await BrowserTestUtils.closeWindow(newWindow);
});

/** Tests content_scripts in the manifest do not affect message display. */
async function subtestContentScriptManifest(message, ...permissions) {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: red; }",
      "test.js": () => {
        document.body.textContent += "Hey look, the script ran!";
      },
    },
    manifest: {
      permissions,
      content_scripts: [
        {
          matches: ["<all_urls>"],
          css: ["test.css"],
          js: ["test.js"],
          match_about_blank: true,
          match_origin_as_fallback: true,
        },
      ],
    },
  });

  // match_origin_as_fallback is not implemented yet. Bug 1475831.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();
  ExtensionTestUtils.failOnSchemaWarnings(true);

  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      textContent: "",
    },
    message
  );

  await extension.unload();
}

add_task(async function testContentScriptManifestNoPermission() {
  about3Pane.threadTree.selectedIndex = 7;
  await awaitBrowserLoaded(messagePane);
  await subtestContentScriptManifest(messages[7]);
});
add_task(async function testContentScriptManifest() {
  about3Pane.threadTree.selectedIndex = 8;
  await awaitBrowserLoaded(messagePane);
  await subtestContentScriptManifest(messages[8], "messagesModify");
});

/** Tests registered content scripts do not affect message display. */
async function subtestContentScriptRegister(message, ...permissions) {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        await browser.contentScripts.register({
          matches: ["<all_urls>"],
          css: [{ file: "test.css" }],
          js: [{ file: "test.js" }],
          matchAboutBlank: true,
        });

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "test.js": () => {
        document.body.querySelector(".moz-text-flowed").textContent +=
          "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions,
    },
  });

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      textContent: "",
    },
    message
  );

  await extension.unload();
}

add_task(async function testContentScriptRegisterNoPermission() {
  about3Pane.threadTree.selectedIndex = 9;
  await awaitBrowserLoaded(messagePane);
  await subtestContentScriptRegister(messages[9], "<all_urls>");
});
add_task(async function testContentScriptRegister() {
  about3Pane.threadTree.selectedIndex = 10;
  await awaitBrowserLoaded(messagePane);
  await subtestContentScriptRegister(
    messages[10],
    "<all_urls>",
    "messagesModify"
  );
});

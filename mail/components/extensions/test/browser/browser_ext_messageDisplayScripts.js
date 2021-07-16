/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account, messages;
let messagePane = document.getElementById("messagepane");

add_task(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("messageDisplayScripts", null);
  let folder = rootFolder.getChildNamed("messageDisplayScripts");
  createMessages(folder, 11);
  messages = [...folder.messages];

  window.gFolderTreeView.selectFolder(folder);
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

  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(messagePane);

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

  window.gFolderDisplay.selectViewIndex(1);
  await BrowserTestUtils.browserLoaded(messagePane);

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

  window.gFolderDisplay.selectViewIndex(2);
  await BrowserTestUtils.browserLoaded(messagePane);

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

  window.gFolderDisplay.selectViewIndex(3);
  await BrowserTestUtils.browserLoaded(messagePane);

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

  window.gFolderDisplay.selectViewIndex(4);
  await BrowserTestUtils.browserLoaded(messagePane);

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
        let registeredScript = await browser.messageDisplayScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        await window.sendMessage();

        await registeredScript.unregister();

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.querySelector(".moz-text-flowed").textContent +=
          "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesModify", "<all_urls>"],
    },
  });

  let tabmail = document.getElementById("tabmail");
  window.gFolderDisplay.selectViewIndex(5);
  await BrowserTestUtils.browserLoaded(messagePane);

  extension.startup();
  await extension.awaitMessage();

  // Check a message that was already loaded.
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      textContent: "",
    },
    messages[5]
  );

  // Load a new message and check it is modified.
  let scriptsAddedPromise = BrowserTestUtils.waitForEvent(
    window,
    "extension-scripts-added"
  );
  window.gFolderDisplay.selectViewIndex(6);
  await scriptsAddedPromise;
  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6]
  );

  // Open the message in a new tab.
  // First, sabotage the message pane so we can be sure it changed.
  messagePane.contentDocument.body.style.backgroundColor = "red";
  messagePane.contentDocument.body.textContent = "Nope.";

  scriptsAddedPromise = BrowserTestUtils.waitForEvent(
    window,
    "extension-scripts-added"
  );
  openMessageInTab(messages[6]);
  await scriptsAddedPromise;
  Assert.equal(tabmail.tabInfo.length, 2);
  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6]
  );

  // Open a content tab. The CSS and script shouldn't apply.
  let newTab = window.openContentTab("http://mochi.test:8888/");
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
    newTab.browser
  );
  scriptsAddedPromise = BrowserTestUtils.waitForEvent(
    window,
    "extension-scripts-added"
  );
  tabmail.closeTab(newTab);

  // We should be back at the message opened in a tab.
  await scriptsAddedPromise;
  await checkMessageBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    messages[6]
  );

  // Open the message in a new window.
  let newWindow = await openMessageInWindow(messages[7]);
  let newWindowMessagePane = newWindow.document.getElementById("messagepane");

  await BrowserTestUtils.waitForEvent(newWindow, "extension-scripts-added");
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

  // Unregister.
  extension.sendMessage();
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
    messages[6]
  );

  // Close the new tab. The message reloads in the first tab, so the CSS
  // should't be applied and the script shouldn't have run.
  // Sabotage the message pane so we can be sure it changed.
  messagePane.contentDocument.body.style.backgroundColor = "red";
  messagePane.contentDocument.body.textContent = "Nope.";
  tabmail.closeTab(tabmail.tabInfo[1]);

  await BrowserTestUtils.browserLoaded(messagePane);
  // Let's wait a while and see if anything happens:
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  await checkMessageBody(
    {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
      foo: null,
      textContent: "",
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
  window.gFolderDisplay.selectViewIndex(7);
  await BrowserTestUtils.browserLoaded(messagePane);
  await subtestContentScriptManifest(messages[7]);
});
add_task(async function testContentScriptManifest() {
  window.gFolderDisplay.selectViewIndex(8);
  await BrowserTestUtils.browserLoaded(messagePane);
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
  window.gFolderDisplay.selectViewIndex(9);
  await BrowserTestUtils.browserLoaded(messagePane);
  await subtestContentScriptRegister(messages[9], "<all_urls>");
});
add_task(async function testContentScriptRegister() {
  window.gFolderDisplay.selectViewIndex(10);
  await BrowserTestUtils.browserLoaded(messagePane);
  await subtestContentScriptRegister(
    messages[10],
    "<all_urls>",
    "messagesModify"
  );
});

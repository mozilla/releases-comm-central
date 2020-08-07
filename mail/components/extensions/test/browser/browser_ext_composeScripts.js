/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

addIdentity(createAccount());

async function checkComposeBody(expected, waitForEvent) {
  let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  Assert.equal(composeWindows.length, 1);

  let composeWindow = composeWindows[0];
  if (waitForEvent) {
    await BrowserTestUtils.waitForEvent(composeWindow, "compose-scripts-added");
  }

  let composeEditor = composeWindow.GetCurrentEditorElement();
  let composeBody = composeEditor.contentDocument.body;
  let computedStyle = composeEditor.contentWindow.getComputedStyle(composeBody);

  if ("backgroundColor" in expected) {
    Assert.equal(computedStyle.backgroundColor, expected.backgroundColor);
  }
  if ("color" in expected) {
    Assert.equal(computedStyle.color, expected.color);
  }
  if ("foo" in expected) {
    Assert.equal(composeBody.getAttribute("foo"), expected.foo);
  }
  if ("textContent" in expected) {
    Assert.equal(composeBody.textContent, expected.textContent);
  }
}

/** Tests browser.tabs.insertCSS and browser.tabs.removeCSS. */
add_task(async function testInsertRemoveCSS() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
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
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgb(0, 128, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.tabs.insertCSS fails without the "compose" permission. */
add_task(async function testInsertRemoveCSSNoPermissions() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();

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

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
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

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.tabs.executeScript. */
add_task(async function testExecuteScript() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.setAttribute("foo", "bar");`,
        });
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, { file: "test.js" });
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ foo: "bar" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.tabs.executeScript fails without the "compose" permission. */
add_task(async function testExecuteScriptNoPermissions() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();

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

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ foo: null, textContent: "" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests the messenger alias is available. */
add_task(async function testExecuteScript() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.textContent = messenger.runtime.getManifest().applications.gecko.id;`,
        });
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      applications: { gecko: { id: "alias@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "alias@mochitest" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Tests browser.composeScripts.register correctly adds CSS and JavaScript to
 * message composition windows opened after it was called. Also tests calling
 * `unregister` on the returned object.
 */
add_task(async function testRegisterBeforeCompose() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let registeredScript = await browser.composeScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        let tab = await browser.compose.beginNew();
        await window.sendMessage();

        await registeredScript.unregister();
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    true
  );
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "rgb(0, 0, 0)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Tests browser.composeScripts.register correctly adds CSS and JavaScript to
 * message composition windows already open when it was called. Also tests
 * calling `unregister` on the returned object.
 */
add_task(async function testRegisterDuringCompose() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
        await window.sendMessage();

        let registeredScript = await browser.composeScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        await window.sendMessage();

        await registeredScript.unregister();
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    true
  );
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "rgb(0, 0, 0)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

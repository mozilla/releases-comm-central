/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

addIdentity(createAccount());

async function checkComposeBody(expected) {
  let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  Assert.equal(composeWindows.length, 1);

  let composeWindow = composeWindows[0];
  await new Promise(resolve => composeWindow.setTimeout(resolve));

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

// Functions for extensions to use, so that we avoid repeating ourselves.
var utilityFunctions = () => {
  this.sendMessageGetReply = function() {
    return new Promise(resolve => {
      browser.test.onMessage.addListener(function listener() {
        browser.test.onMessage.removeListener(listener);
        resolve();
      });
      browser.test.sendMessage();
    });
  };
};

add_task(async function testInsertRemoveCSS() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
        await this.sendMessageGetReply();

        await browser.tabs.insertCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await this.sendMessageGetReply();

        await browser.tabs.removeCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await this.sendMessageGetReply();

        await browser.tabs.insertCSS(tab.id, { file: "test.css" });
        await this.sendMessageGetReply();

        await browser.tabs.removeCSS(tab.id, { file: "test.css" });
        await this.sendMessageGetReply();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": utilityFunctions,
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

        await this.sendMessageGetReply();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "utils.js": utilityFunctions,
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

add_task(async function testExecuteScript() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tab = await browser.compose.beginNew();
        await this.sendMessageGetReply();

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.setAttribute("foo", "bar");`,
        });
        await this.sendMessageGetReply();

        await browser.tabs.executeScript(tab.id, { file: "test.js" });
        await this.sendMessageGetReply();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": utilityFunctions,
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

        await this.sendMessageGetReply();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": utilityFunctions,
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

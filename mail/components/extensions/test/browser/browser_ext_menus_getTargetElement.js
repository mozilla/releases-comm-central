/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

// Test that getTargetElement() works from an extension popup window.
add_task(async function test_getTargetElement_in_extension_popup() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async function () {
        browser.menus.onShown.addListener(info => {
          browser.test.sendMessage("onShown", {
            targetElementId: info.targetElementId,
          });
        });

        browser.menus.onClicked.addListener(info => {
          browser.test.sendMessage("onClicked", {
            targetElementId: info.targetElementId,
          });
        });

        await browser.menus.create({
          id: "test-item",
          title: "Test Item",
          contexts: ["all"],
        });

        await browser.windows.create({
          url: "popup.html",
          type: "popup",
          width: 400,
          height: 300,
        });
        browser.test.sendMessage("ready");
      },
      "popup.html": `<!DOCTYPE html><html><body>
        <p id="target">Right-click me</p>
        <a id="link" href="http://example.com/">A link</a>
        <script src="popup.js"></script>
      </body></html>`,
      "popup.js": `
        browser.test.onMessage.addListener(
          (msg, targetElementId, expectedId, description) => {
            if (msg !== "checkElement") {
              return;
            }
            const element = browser.menus.getTargetElement(targetElementId);
            if (expectedId === null) {
              browser.test.assertEq(
                null,
                element,
                description
              );
            } else {
              browser.test.assertTrue(
                element != null,
                description + " - element should not be null"
              );
              if (element) {
                browser.test.assertEq(
                  expectedId,
                  element.id,
                  description
                );
              }
            }
            browser.test.sendMessage("checkElementDone");
          }
        );
        browser.test.sendMessage("popupReady");
      `,
    },
    manifest: {
      manifest_version: 2,
      permissions: ["menus"],
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: { id: "menus@mochi.test" },
      },
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");
  await extension.awaitMessage("popupReady");

  const popupWin = Services.wm.getMostRecentWindow("mail:extensionPopup");
  Assert.ok(popupWin, "Extension popup window should be found");
  const browser = popupWin.document.getElementById("requestFrame");
  Assert.ok(browser, "requestFrame browser element should be found");

  const menu = popupWin.document.getElementById("browserContext");
  Assert.ok(menu, "browserContext menu should exist");

  info("Right-click on the paragraph.");
  await rightClickOnContent(menu, "#target", browser);
  const shownInfo = await extension.awaitMessage("onShown");
  Assert.equal(
    typeof shownInfo.targetElementId,
    "number",
    "onShown should include a numeric targetElementId"
  );

  // Verify getTargetElement returns the correct element from popup context.
  extension.sendMessage(
    "checkElement",
    shownInfo.targetElementId,
    "target",
    "getTargetElement should return #target"
  );
  await extension.awaitMessage("checkElementDone");

  // Verify getTargetElement returns null for an invalid ID.
  extension.sendMessage("checkElement", -1, null, "should return null for -1");
  await extension.awaitMessage("checkElementDone");

  await closeMenuPopup(menu);

  info("Right-click on the link.");
  await rightClickOnContent(menu, "#link", browser);
  const shownInfo2 = await extension.awaitMessage("onShown");
  Assert.equal(
    typeof shownInfo2.targetElementId,
    "number",
    "onShown should include a numeric targetElementId for link"
  );

  // Verify getTargetElement returns the link element.
  extension.sendMessage(
    "checkElement",
    shownInfo2.targetElementId,
    "link",
    "getTargetElement should return #link"
  );
  await extension.awaitMessage("checkElementDone");

  // Previous targetElementId should have expired.
  extension.sendMessage(
    "checkElement",
    shownInfo.targetElementId,
    null,
    "previous targetElementId should have expired"
  );
  await extension.awaitMessage("checkElementDone");

  await closeMenuPopup(menu);

  await extension.unload();
});

// Test that getTargetElement() works from a message display script in the
// message pane.
add_task(async function test_getTargetElement_in_message_pane() {
  const account = createAccount();
  addIdentity(account);
  const folder = account.incomingServer.rootFolder.subFolders[0];
  await createMessages(folder, {
    count: 1,
    body: {
      contentType: "text/html",
      body: await IOUtils.readUTF8(getTestFilePath("data/content.html")),
    },
  });

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: folder.URI,
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;
  const aboutMessage = about3Pane.messageBrowser.contentWindow;
  const messageBrowser = aboutMessage.getMessagePaneBrowser();
  await awaitBrowserLoaded(messageBrowser, url => url != "about:blank");

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async function () {
        browser.menus.onShown.addListener(info => {
          browser.test.sendMessage("onShown", {
            targetElementId: info.targetElementId,
          });
        });

        await browser.menus.create({
          id: "test-item",
          title: "Test Item",
          contexts: ["page", "link", "image"],
        });

        await browser.messageDisplayScripts.register({
          js: [{ file: "messageScript.js" }],
        });

        browser.test.sendMessage("ready");
      },
      "messageScript.js": function () {
        browser.test.onMessage.addListener(
          (msg, targetElementId, expectedSelector, description) => {
            if (msg !== "checkElement") {
              return;
            }
            const expected = expectedSelector
              ? document.querySelector(expectedSelector)
              : null;
            const element = browser.menus.getTargetElement(targetElementId);
            browser.test.assertEq(expected, element, description);
            browser.test.sendMessage("checkElementDone");
          }
        );
        browser.test.sendMessage("scriptReady");
      },
    },
    manifest: {
      manifest_version: 2,
      permissions: ["menus", "messagesRead", "messagesModify"],
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: { id: "menus@mochi.test" },
      },
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  // Re-select message to trigger the message display script.
  about3Pane.threadTree.selectedIndex = -1;
  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(messageBrowser, url => url != "about:blank");
  await extension.awaitMessage("scriptReady");

  const menuId = messageBrowser.getAttribute("context") || "mailContext";
  let ownerDocument;
  if (messageBrowser.documentGlobal.parent.location.href == "about:3pane") {
    ownerDocument = messageBrowser.documentGlobal.parent.document;
  } else {
    ownerDocument = messageBrowser.ownerDocument;
  }
  const menu = ownerDocument.getElementById(menuId);

  // Focus the browser before right-clicking.
  await synthesizeMouseAtCenterAndRetry("body", {}, messageBrowser);

  info("Right-click on a link in the message pane.");
  await rightClickOnContent(menu, "a", messageBrowser);
  const shownInfo = await extension.awaitMessage("onShown");
  Assert.equal(
    typeof shownInfo.targetElementId,
    "number",
    "onShown should include a numeric targetElementId in message pane"
  );

  // Verify getTargetElement returns the correct element from message script.
  extension.sendMessage(
    "checkElement",
    shownInfo.targetElementId,
    "a",
    "getTargetElement should return the link element"
  );
  await extension.awaitMessage("checkElementDone");

  await closeMenuPopup(menu);

  info("Right-click on an image in the message pane.");
  await rightClickOnContent(menu, "img", messageBrowser);
  const shownInfo2 = await extension.awaitMessage("onShown");
  Assert.equal(
    typeof shownInfo2.targetElementId,
    "number",
    "onShown should include a numeric targetElementId for image"
  );

  // Verify getTargetElement returns the image element from message script.
  extension.sendMessage(
    "checkElement",
    shownInfo2.targetElementId,
    "img",
    "getTargetElement should return the image element"
  );
  await extension.awaitMessage("checkElementDone");

  // Previous targetElementId should have expired.
  extension.sendMessage(
    "checkElement",
    shownInfo.targetElementId,
    null,
    "previous targetElementId should have expired"
  );
  await extension.awaitMessage("checkElementDone");

  await closeMenuPopup(menu);

  await extension.unload();
});

// Test that getTargetElement() works from a content script injected into a
// remote content page opened in a content tab.
add_task(async function test_getTargetElement_in_content_tab() {
  const CONTENT_PAGE =
    "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html";

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async function () {
        browser.menus.onShown.addListener(info => {
          browser.test.sendMessage("onShown", {
            targetElementId: info.targetElementId,
          });
        });

        await browser.menus.create({
          id: "test-item",
          title: "Test Item",
          contexts: ["all"],
        });

        browser.test.sendMessage("ready");
      },
      "contentScript.js": function () {
        browser.test.onMessage.addListener(
          (msg, targetElementId, expectedSelector, description) => {
            if (msg !== "checkElement") {
              return;
            }
            const expected = expectedSelector
              ? document.querySelector(expectedSelector)
              : null;
            const element = browser.menus.getTargetElement(targetElementId);
            browser.test.assertEq(expected, element, description);
            browser.test.sendMessage("checkElementDone");
          }
        );
        browser.test.sendMessage("contentScriptReady");
      },
    },
    manifest: {
      manifest_version: 2,
      permissions: ["menus", "*://mochi.test/*"],
      background: { scripts: ["background.js"] },
      content_scripts: [
        {
          matches: ["*://mochi.test/*"],
          js: ["contentScript.js"],
          run_at: "document_idle",
        },
      ],
      browser_specific_settings: {
        gecko: { id: "menus@mochi.test" },
      },
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const tabmail = document.getElementById("tabmail");
  window.openContentTab(CONTENT_PAGE);
  await extension.awaitMessage("contentScriptReady");

  const tab = tabmail.currentTabInfo;
  const browser = tab.browser;
  await awaitBrowserLoaded(browser, url => url != "about:blank");

  const menu =
    browser.documentGlobal.top.document.getElementById("browserContext");
  Assert.ok(menu, "browserContext menu should exist");

  await synthesizeMouseAtCenterAndRetry("body", {}, browser);

  info("Right-click on a link in the content tab.");
  await rightClickOnContent(menu, "a", browser);
  const shownInfo = await extension.awaitMessage("onShown");
  Assert.equal(
    typeof shownInfo.targetElementId,
    "number",
    "onShown should include a numeric targetElementId in content tab"
  );

  // Verify getTargetElement returns the correct element from content script.
  extension.sendMessage(
    "checkElement",
    shownInfo.targetElementId,
    "a",
    "getTargetElement should return the link element"
  );
  await extension.awaitMessage("checkElementDone");

  // Invalid ID returns null.
  extension.sendMessage(
    "checkElement",
    -1,
    null,
    "getTargetElement should return null for invalid ID"
  );
  await extension.awaitMessage("checkElementDone");

  await closeMenuPopup(menu);

  tabmail.closeTab(tab);
  await extension.unload();
});

// Test that getTargetElement returns null in the background script, since
// there is no content DOM to look up elements in.
add_task(async function test_getTargetElement_null_in_background() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async function () {
        const element = browser.menus.getTargetElement(12345);
        browser.test.assertEq(
          null,
          element,
          "getTargetElement should return null in background"
        );
        browser.test.sendMessage("done");
      },
    },
    manifest: {
      manifest_version: 2,
      permissions: ["menus"],
      background: { scripts: ["background.js"] },
    },
  });

  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  async function test_it(extension) {
    await extension.startup();

    let buttonId = "test1_mochi_test-browserAction-toolbarbutton";
    let toolbar = document.getElementById("mail-bar3");
    ok(!toolbar.getAttribute("currentset"), "No toolbar current set");

    let button = document.getElementById(buttonId);
    ok(button, "Button created");
    is(toolbar.id, button.parentNode.id, "Button added to toolbar");
    ok(toolbar.currentSet.split(",").includes(buttonId), "Button added to toolbar current set");

    let icon = document.getAnonymousElementByAttribute(
      button, "class", "toolbarbutton-icon"
    );
    is(getComputedStyle(icon).listStyleImage,
       `url("chrome://messenger/content/extension.svg")`, "Default icon");
    let label = document.getAnonymousElementByAttribute(
      button, "class", "toolbarbutton-text"
    );
    is(label.value, "This is a test", "Correct label");

    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 });
    await extension.awaitFinish("browserAction");
    await promiseAnimationFrame();

    is(document.getElementById(buttonId), button);
    label = document.getAnonymousElementByAttribute(
      button, "class", "toolbarbutton-text"
    );
    is(label.value, "New title", "Correct label");

    await extension.unload();
    await promiseAnimationFrame();

    ok(!document.getElementById(buttonId), "Button destroyed");
  }

  async function background_nopopup() {
    browser.browserAction.onClicked.addListener(async () => {
      await browser.browserAction.setTitle({ title: "New title" });
      await new Promise(setTimeout);
      browser.test.notifyPass("browserAction");
    });
  }

  async function background_popup() {
    browser.runtime.onMessage.addListener(async (msg) => {
      browser.test.assertEq("popup.html", msg);
      await browser.browserAction.setTitle({ title: "New title" });
      await new Promise(setTimeout);
      browser.test.notifyPass("browserAction");
    });
  }

  let extensionDetails = {
    background: background_nopopup,
    files: {
      "popup.html": `<html>
          <head>
            <meta charset="utf-8">
            <script src="popup.js"></script>
          </head>
          <body>popup.js</body>
        </html>`,
      "popup.js": function() {
        window.onload = async () => {
          await browser.runtime.sendMessage("popup.html");
          window.close();
        };
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      browser_action: {
        default_title: "This is a test",
      },
    },
  };
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await test_it(extension);

  extensionDetails.background = background_popup;
  extensionDetails.manifest.browser_action.default_popup = "popup.html";
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await test_it(extension);
});

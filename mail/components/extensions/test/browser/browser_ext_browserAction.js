/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  async function test_it(extension) {
    await extension.startup();
    await promiseAnimationFrame();
    await new Promise(resolve => setTimeout(resolve));

    let buttonId = "browser_action_mochi_test-browserAction-toolbarbutton";
    let toolbar = document.getElementById("mail-bar3");

    let button = document.getElementById(buttonId);
    ok(button, "Button created");
    is(toolbar.id, button.parentNode.id, "Button added to toolbar");
    ok(
      toolbar.currentSet.split(",").includes(buttonId),
      "Button added to toolbar current set"
    );
    ok(
      toolbar
        .getAttribute("currentset")
        .split(",")
        .includes(buttonId),
      "Button added to toolbar current set attribute"
    );
    ok(
      Services.xulStore
        .getValue(location.href, "mail-bar3", "currentset")
        .split(",")
        .includes(buttonId),
      "Button added to toolbar current set persistence"
    );

    let icon = button.querySelector(".toolbarbutton-icon");
    is(
      getComputedStyle(icon).listStyleImage,
      `url("chrome://messenger/content/extension.svg")`,
      "Default icon"
    );
    let label = button.querySelector(".toolbarbutton-text");
    is(label.value, "This is a test", "Correct label");

    let clicked = extension.awaitMessage("browserAction");
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 });
    await clicked;
    await promiseAnimationFrame();
    await new Promise(resolve => setTimeout(resolve));

    is(document.getElementById(buttonId), button);
    label = button.querySelector(".toolbarbutton-text");
    is(label.value, "New title", "Correct label");

    await extension.unload();
    await promiseAnimationFrame();
    await new Promise(resolve => setTimeout(resolve));

    ok(!document.getElementById(buttonId), "Button destroyed");
    ok(
      !Services.xulStore
        .getValue(location.href, "mail-bar3", "currentset")
        .split(",")
        .includes(buttonId),
      "Button removed from toolbar current set persistence"
    );
  }

  async function background_nopopup() {
    browser.browserAction.onClicked.addListener(async (tab, info) => {
      browser.test.assertEq("object", typeof tab);
      browser.test.assertEq("object", typeof info);
      browser.test.assertEq(0, info.button);
      browser.test.assertTrue(Array.isArray(info.modifiers));
      browser.test.assertEq(0, info.modifiers.length);
      browser.test.log(`Tab ID is ${tab.id}`);
      await browser.browserAction.setTitle({ title: "New title" });
      browser.test.sendMessage("browserAction");
    });
  }

  async function background_popup() {
    browser.runtime.onMessage.addListener(async msg => {
      browser.test.assertEq("popup.html", msg);
      await browser.browserAction.setTitle({ title: "New title" });
      browser.test.sendMessage("browserAction");
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
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => setTimeout(resolve, 1000));
          await browser.runtime.sendMessage("popup.html");
          window.close();
        };
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: "browser_action@mochi.test",
        },
      },
      browser_action: {
        default_title: "This is a test",
      },
    },
    useAddonManager: "temporary",
  };
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await test_it(extension);

  extensionDetails.background = background_popup;
  extensionDetails.manifest.browser_action.default_popup = "popup.html";
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await test_it(extension);

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
});

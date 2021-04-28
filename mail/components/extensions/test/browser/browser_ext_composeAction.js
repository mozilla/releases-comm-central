/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

async function test_it(account, extensionDetails, toolbarId) {
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  let buttonId = "compose_action_mochi_test-composeAction-toolbarbutton";

  await extension.startup();
  await extension.awaitMessage();

  let composeWindow = await openComposeWindow(account);
  let composeDocument = composeWindow.document;

  await focusWindow(composeWindow);

  try {
    let toolbar = composeDocument.getElementById(toolbarId);

    let button = composeDocument.getElementById(buttonId);
    ok(button, "Button created");
    is(toolbar.id, button.parentNode.id, "Button added to toolbar");
    ok(
      toolbar.currentSet.split(",").includes(buttonId),
      "Button added to toolbar current set"
    );
    if (toolbarId != "FormatToolbar") {
      ok(
        toolbar
          .getAttribute("currentset")
          .split(",")
          .includes(buttonId),
        "Button added to toolbar current set attribute"
      );
      ok(
        Services.xulStore
          .getValue(composeWindow.location.href, toolbarId, "currentset")
          .split(",")
          .includes(buttonId),
        "Button added to toolbar current set persistence"
      );
    }

    let icon = button.querySelector(".toolbarbutton-icon");
    is(
      getComputedStyle(icon).listStyleImage,
      `url("chrome://messenger/content/extension.svg")`,
      "Default icon"
    );
    let label = button.querySelector(".toolbarbutton-text");
    is(label.value, "This is a test", "Correct label");

    let clickedPromise = extension.awaitMessage("composeAction");
    EventUtils.synthesizeMouseAtCenter(
      button,
      { clickCount: 1 },
      composeWindow
    );
    await clickedPromise;
    await promiseAnimationFrame(composeWindow);
    await new Promise(resolve => composeWindow.setTimeout(resolve));

    is(composeDocument.getElementById(buttonId), button);

    label = button.querySelector(".toolbarbutton-text");
    is(label.value, "New title", "Correct label");
  } finally {
    await extension.unload();
    await promiseAnimationFrame(composeWindow);
    await new Promise(resolve => composeWindow.setTimeout(resolve));

    ok(!composeDocument.getElementById(buttonId), "Button destroyed");
    if (toolbarId != "FormatToolbar") {
      ok(
        !Services.xulStore
          .getValue(composeWindow.location.href, toolbarId, "currentset")
          .split(",")
          .includes(buttonId),
        "Button removed from toolbar current set persistence"
      );
    }
    composeWindow.close();
  }
}

add_task(async function setup() {
  let account = createAccount();
  addIdentity(account);

  async function background_nopopup() {
    browser.test.log("nopopup background script ran");
    browser.composeAction.onClicked.addListener(async (tab, info) => {
      browser.test.assertEq("object", typeof tab);
      browser.test.assertEq("object", typeof info);
      browser.test.assertEq(0, info.button);
      browser.test.assertTrue(Array.isArray(info.modifiers));
      browser.test.assertEq(0, info.modifiers.length);
      browser.test.log(`Tab ID is ${tab.id}`);
      await browser.composeAction.setTitle({ title: "New title" });
      await new Promise(resolve => setTimeout(resolve));
      browser.test.sendMessage("composeAction");
    });

    browser.test.sendMessage();
  }

  async function background_popup() {
    browser.test.log("popup background script ran");
    browser.runtime.onMessage.addListener(async msg => {
      browser.test.assertEq("popup.html", msg);
      await browser.composeAction.setTitle({ title: "New title" });
      await new Promise(resolve => setTimeout(resolve));
      browser.test.sendMessage("composeAction");
    });

    browser.test.sendMessage();
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
          id: "compose_action@mochi.test",
        },
      },
      compose_action: {
        default_title: "This is a test",
      },
    },
    useAddonManager: "temporary",
  };

  await test_it(account, extensionDetails, "composeToolbar2");

  extensionDetails.background = background_popup;
  extensionDetails.manifest.compose_action.default_popup = "popup.html";
  await test_it(account, extensionDetails, "composeToolbar2");

  extensionDetails.background = background_nopopup;
  extensionDetails.manifest.compose_action.default_area = "formattoolbar";
  delete extensionDetails.manifest.compose_action.default_popup;
  await test_it(account, extensionDetails, "FormatToolbar");

  extensionDetails.background = background_popup;
  extensionDetails.manifest.compose_action.default_popup = "popup.html";
  await test_it(account, extensionDetails, "FormatToolbar");

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
});

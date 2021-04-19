/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;

add_task(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 30);
  messages = subFolders[0].messages;

  window.gFolderTreeView.selectFolder(subFolders[0]);
  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(window.getMessagePaneBrowser());
});

add_task(async () => {
  async function test_it(extensionDetails, win) {
    let extension = ExtensionTestUtils.loadExtension(extensionDetails);
    let doc = win.document;

    await extension.startup();
    await promiseAnimationFrame();

    let buttonId =
      "message_display_action_mochi_test-messageDisplayAction-toolbarbutton";
    let toolbar = doc.getElementById("header-view-toolbar");

    let button = doc.getElementById(buttonId);
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

    let icon = button.querySelector(".toolbarbutton-icon");
    is(
      getComputedStyle(icon).listStyleImage,
      `url("chrome://messenger/content/extension.svg")`,
      "Default icon"
    );
    let label = button.querySelector(".toolbarbutton-text");
    is(label.value, "This is a test", "Correct label");

    let clickedPromise = extension.awaitMessage("messageDisplayAction");
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, win);
    await clickedPromise;
    await promiseAnimationFrame(win);
    await new Promise(resolve => win.setTimeout(resolve));

    // Close the menupopup caused by a click on a menu typed button.
    let menupopup = button.querySelector("menupopup");
    if (menupopup) {
      menupopup.hidePopup();
    }

    is(doc.getElementById(buttonId), button);
    label = button.querySelector(".toolbarbutton-text");
    is(label.value, "New title", "Correct label");

    await extension.unload();
    await promiseAnimationFrame(win);
    await new Promise(resolve => win.setTimeout(resolve));

    ok(!doc.getElementById(buttonId), "Button destroyed");
  }

  async function background_nopopup() {
    browser.messageDisplayAction.onClicked.addListener(async (tab, info) => {
      browser.test.assertEq("object", typeof tab);
      browser.test.assertEq("object", typeof info);
      browser.test.assertEq(0, info.button);
      browser.test.assertTrue(Array.isArray(info.modifiers));
      browser.test.assertEq(0, info.modifiers.length);
      browser.test.log(`Tab ID is ${tab.id}`);
      await browser.messageDisplayAction.setTitle({ title: "New title" });
      browser.test.sendMessage("messageDisplayAction");
    });
  }

  async function background_popup() {
    browser.runtime.onMessage.addListener(async msg => {
      browser.test.assertEq("popup.html", msg);
      await browser.messageDisplayAction.setTitle({ title: "New title" });
      browser.test.sendMessage("messageDisplayAction");
    });
  }

  async function background_menu() {
    browser.runtime.onMessage.addListener(async msg => {
      throw new Error("Popup should not open for menu typed buttons.");
    });

    browser.messageDisplayAction.onClicked.addListener(async (tab, info) => {
      throw new Error("onClicked should not fire for menu typed buttons.");
    });

    browser.menus.onShown.addListener(async (tab, info) => {
      browser.test.assertEq("object", typeof tab);
      browser.test.assertEq("object", typeof info);
      browser.test.log(`Tab ID is ${tab.id}`);
      await browser.messageDisplayAction.setTitle({ title: "New title" });
      browser.test.sendMessage("messageDisplayAction");
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
          id: "message_display_action@mochi.test",
        },
      },
      message_display_action: {
        default_title: "This is a test",
      },
      permissions: ["menus"],
    },
    useAddonManager: "temporary",
  };

  for (let buttonType of [null, "button", "menu", "menu-button"]) {
    for (let popup of [null, "popup.html"]) {
      delete extensionDetails.manifest.message_display_action.type;
      delete extensionDetails.manifest.message_display_action.default_popup;

      if (buttonType) {
        extensionDetails.manifest.message_display_action.type = buttonType;
      }
      if (popup) {
        extensionDetails.manifest.message_display_action.default_popup = popup;
        extensionDetails.background =
          buttonType == "menu" ? background_menu : background_popup;
      } else {
        extensionDetails.background =
          buttonType == "menu" ? background_menu : background_nopopup;
      }

      info(
        `3-pane tab, ${popup ? "with" : "no"} pop-up, ${buttonType ||
          "default"} button type`
      );
      await test_it(extensionDetails, window);

      info(
        `Message tab, ${popup ? "with" : "no"} pop-up, ${buttonType ||
          "default"} button type`
      );
      await openMessageInTab(messages.getNext());
      await test_it(extensionDetails, window);
      document.getElementById("tabmail").closeTab();

      info(
        `Message window, ${popup ? "with" : "no"} pop-up, ${buttonType ||
          "default"} button type`
      );
      let messageWindow = await openMessageInWindow(messages.getNext());
      await test_it(extensionDetails, messageWindow);
      messageWindow.close();
    }
  }
});

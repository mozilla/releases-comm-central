/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;

add_setup(async () => {
  account = createAccount();
  addIdentity(account);
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  for (const area of [null, "formattoolbar"]) {
    const composeWindow = await openComposeWindow(account);
    await focusWindow(composeWindow);

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
    });

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
      disable_button: true,
    });

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
      use_default_popup: true,
    });

    composeWindow.close();
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  }
});

const background_for_openPopup_tests = async () => {
  const composeTab = await browser.compose.beginNew();
  browser.test.assertTrue(!!composeTab, "should have found a compose tab");

  const windows = await browser.windows.getAll();
  const composeWindow = windows.find(window => window.type == "messageCompose");
  browser.test.assertTrue(
    !!composeWindow,
    "should have found a compose window"
  );

  // The test starts with an opened composeWindow, the compose_action
  // is allowed there and should be visible, openPopup() should succeed.
  browser.test.assertTrue(
    (await browser.windows.get(composeWindow.id)).focused,
    "composeWindow should be focused"
  );
  browser.test.assertTrue(
    await browser.composeAction.openPopup(),
    "openPopup() should have succeeded while the compose window is active"
  );
  await window.waitForMessage();

  // Disable the compose_action, openPopup() should fail.
  await browser.composeAction.disable();
  browser.test.assertFalse(
    await browser.composeAction.openPopup(),
    "openPopup() should have failed after the action button was disabled"
  );

  // Enable the compose_action, openPopup() should succeed.
  await browser.composeAction.enable();
  browser.test.assertTrue(
    await browser.composeAction.openPopup(),
    "openPopup() should have succeeded after the action button was enabled again"
  );
  await window.waitForMessage();

  // Create a popup window, which does not have a compose_action, openPopup()
  // should fail.
  const popupWindow = await browser.windows.create({
    type: "popup",
    url: "https://www.example.com",
  });
  browser.test.assertTrue(
    (await browser.windows.get(popupWindow.id)).focused,
    "popupWindow should be focused"
  );
  browser.test.assertFalse(
    await browser.composeAction.openPopup(),
    "openPopup() should have failed while the popup window is active"
  );

  // Specifically open the compose_action of the compose window, should become
  // focused and openPopup() should succeed.
  browser.test.assertTrue(
    await browser.composeAction.openPopup({
      windowId: composeWindow.id,
    }),
    "openPopup() should have succeeded when explicitly requesting the compose window"
  );
  await window.waitForMessage();
  browser.test.assertTrue(
    (await browser.windows.get(composeWindow.id)).focused,
    "composeWindow should be focused"
  );

  // The compose window is focused now, openPopup() should succeed.
  browser.test.assertTrue(
    await browser.composeAction.openPopup(),
    "openPopup() should have succeeded while the compose window is active"
  );
  await window.waitForMessage();

  // Collapse the toolbar, openPopup() should fail.
  await window.sendMessage("collapseToolbar", true);
  browser.test.assertFalse(
    await browser.composeAction.openPopup(),
    "openPopup() should have failed while the toolbar is collapsed"
  );

  // Restore the toolbar, openPopup() should succeed.
  await window.sendMessage("collapseToolbar", false);
  browser.test.assertTrue(
    await browser.composeAction.openPopup(),
    "openPopup() should have succeeded after the toolbar is restored"
  );
  await window.waitForMessage();

  // Close the popup window and finish
  await browser.windows.remove(popupWindow.id);
  await browser.windows.remove(composeWindow.id);
  browser.test.notifyPass("finished");
};

// This test uses openPopup() to open the popup in a compose window.
add_task(
  async function test_popup_open_with_openPopup_in_compose_maintoolbar() {
    const files = {
      "background.js": background_for_openPopup_tests,
      "utils.js": await getUtilsJS(),
      "popup.html": `<!DOCTYPE html>
        <html>
          <head>
            <title>Popup</title>
            <meta charset="utf-8">
            <script defer="defer" src="popup.js"></script>
          </head>
          <body>
            <p>Hello</p>
          </body>
        </html>`,
      "popup.js": async function () {
        browser.test.sendMessage("popup opened");
        window.close();
      },
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      useAddonManager: "temporary",
      manifest: {
        applications: {
          gecko: {
            id: "compose_action_openPopup@mochi.test",
          },
        },
        background: { scripts: ["utils.js", "background.js"] },
        compose_action: {
          default_title: "default",
          default_popup: "popup.html",
        },
      },
    });

    extension.onMessage("popup opened", async () => {
      // Wait a moment to make sure the popup has closed.
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(r => window.setTimeout(r, 150));
      extension.sendMessage();
    });

    extension.onMessage("collapseToolbar", state => {
      const window = Services.wm.getMostRecentWindow("msgcompose");
      const toolbar = window.document.getElementById("composeToolbar2");
      if (state) {
        toolbar.setAttribute("collapsed", "true");
      } else {
        toolbar.removeAttribute("collapsed");
      }
      extension.sendMessage();
    });

    await extension.startup();
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

// This test uses openPopup() to open the popup in a compose window.
add_task(
  async function test_popup_open_with_openPopup_in_compose_formatoolbar() {
    const files = {
      "background.js": background_for_openPopup_tests,
      "utils.js": await getUtilsJS(),
      "popup.html": `<!DOCTYPE html>
        <html>
          <head>
            <title>Popup</title>
            <meta charset="utf-8">
            <script defer="defer" src="popup.js"></script>
          </head>
          <body>
            <p>Hello</p>
          </body>
        </html>`,
      "popup.js": async function () {
        browser.test.sendMessage("popup opened");
        window.close();
      },
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      useAddonManager: "temporary",
      manifest: {
        applications: {
          gecko: {
            id: "compose_action_openPopup@mochi.test",
          },
        },
        background: { scripts: ["utils.js", "background.js"] },
        compose_action: {
          default_title: "default",
          default_popup: "popup.html",
          default_area: "formattoolbar",
        },
      },
    });

    extension.onMessage("popup opened", async () => {
      // Wait a moment to make sure the popup has closed.
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(r => window.setTimeout(r, 150));
      extension.sendMessage();
    });

    extension.onMessage("collapseToolbar", state => {
      const window = Services.wm.getMostRecentWindow("msgcompose");
      const toolbar = window.document.getElementById("FormatToolbar");
      if (state) {
        toolbar.setAttribute("collapsed", "true");
      } else {
        toolbar.removeAttribute("collapsed");
      }
      extension.sendMessage();
    });

    await extension.startup();
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

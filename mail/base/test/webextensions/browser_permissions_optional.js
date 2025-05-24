"use strict";
add_task(async function test_request_permissions_without_prompt() {
  async function pageScript() {
    const NO_PROMPT_PERM = "activeTab";
    window.addEventListener(
      "keypress",
      async () => {
        const permGranted = await browser.permissions.request({
          permissions: [NO_PROMPT_PERM],
        });
        browser.test.assertTrue(
          permGranted,
          `${NO_PROMPT_PERM} permission was granted.`
        );
        const perms = await browser.permissions.getAll();
        browser.test.assertTrue(
          perms.permissions.includes(NO_PROMPT_PERM),
          `${NO_PROMPT_PERM} permission exists.`
        );
        browser.test.sendMessage("permsGranted");
      },
      { once: true }
    );
    browser.test.sendMessage("pageReady");
  }

  const extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.test.sendMessage("ready", browser.runtime.getURL("page.html"));
    },
    files: {
      "page.html": `<html><head><script src="page.js"></script></head></html>`,
      "page.js": pageScript,
    },
    manifest: {
      optional_permissions: ["activeTab"],
    },
  });
  await extension.startup();

  const url = await extension.awaitMessage("ready");

  const tab = openContentTab(url, undefined, null);
  await extension.awaitMessage("pageReady");
  await new Promise(resolve => requestAnimationFrame(resolve));
  await BrowserTestUtils.synthesizeMouseAtCenter(tab.browser, {}, tab.browser);
  await BrowserTestUtils.synthesizeKey("a", {}, tab.browser);
  await extension.awaitMessage("permsGranted");
  await extension.unload();

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});

add_task(async function test_request_permissions_from_popup() {
  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      browser.permissions.onAdded.addListener(({ permissions }) => {
        if (permissions.includes("notifications")) {
          browser.test.sendMessage("permsGranted");
        }
      });
      await browser.browserAction.openPopup();
      browser.test.sendMessage("add-on ready");
    },
    files: {
      "popup.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>Popup</title>
          <meta charset="utf-8">
          <script defer="defer" src="popup.js"></script>
        </head>
        <body>
          <p id="clickme">Request Permissions</p>
        </body>
      </html>`,
      "popup.js": function () {
        document.getElementById("clickme").addEventListener("click", () => {
          browser.permissions.request({ permissions: ["notifications"] });
        });
        browser.test.sendMessage("popup ready");
      },
    },
    manifest: {
      optional_permissions: ["notifications"],
      browser_action: {
        default_popup: "popup.html",
        default_title: "Permission Popup",
      },
    },
  });

  await extension.startup();
  await extension.awaitMessage("add-on ready");
  await extension.awaitMessage("popup ready");

  // Wait for the action panel to be shown.
  const browser = document.querySelector(".webextension-popup-browser");
  Assert.ok(!!browser, "Should have found a browser for the action popup");
  const actionPanel = browser.closest("panel");
  await BrowserTestUtils.waitForPopupEvent(actionPanel, "shown");

  // Linux sometimes fails to deliver the click into the freshly opened action
  // popup. Apparently it is not fully opened despite the correct events have
  // already been fired.
  await new Promise(resolve => requestAnimationFrame(resolve));
  await BrowserTestUtils.waitForCondition(
    () => actionPanel.getAttribute("panelopen") == "true"
  );

  // Click on the element with id "clickme", and wait for the permission prompt.
  const permissionPanelPromise = promisePopupNotificationShown(
    "addon-webext-permissions"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter("#clickme", {}, browser);
  const permissionPanel = await permissionPanelPromise;

  // Accept the optional permission and wait for the permission being granted.
  permissionPanel.button.click();
  await extension.awaitMessage("permsGranted");

  await extension.unload();
});

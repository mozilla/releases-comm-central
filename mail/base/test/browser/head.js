/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

async function focusWindow(win) {
  win.focus();
  await TestUtils.waitForCondition(
    () => Services.focus.focusedWindow?.browsingContext.topChromeWindow == win,
    "waiting for window to be focused"
  );
}

async function openExtensionPopup(win, buttonId) {
  await focusWindow(win);

  let actionButton = await TestUtils.waitForCondition(
    () => win.document.getElementById(buttonId),
    "waiting for the action button to exist"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(actionButton),
    "waiting for action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, win);

  let panel = win.document.getElementById("webextension-remote-preload-panel");
  let browser = panel.querySelector("browser");
  await TestUtils.waitForCondition(
    () => browser.clientWidth > 100,
    "waiting for browser to resize"
  );

  return { actionButton, panel, browser };
}

// Report and remove any remaining accounts/servers. If we register a cleanup
// function here, it will run before any other cleanup function has had a
// chance to run. Instead, when it runs register another cleanup function
// which will run last.
registerCleanupFunction(function() {
  registerCleanupFunction(function() {
    for (let server of MailServices.accounts.allServers) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found ${server} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
    for (let account of MailServices.accounts.accounts) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found ${account} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }
  });
});

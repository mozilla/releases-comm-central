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

async function clickExtensionButton(win, buttonId) {
  await focusWindow(win.top);

  buttonId = CSS.escape(buttonId);
  const actionButton = await TestUtils.waitForCondition(
    () =>
      win.document.querySelector(
        `#${buttonId}, [item-id="${buttonId}"] button`
      ),
    "waiting for the action button to exist"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(actionButton),
    "waiting for action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, win);

  return actionButton;
}

async function openExtensionPopup(win, buttonId) {
  const actionButton = await clickExtensionButton(win, buttonId);

  const panel = win.top.document.getElementById(
    "webextension-remote-preload-panel"
  );
  const browser = panel.querySelector("browser");
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
registerCleanupFunction(function () {
  registerCleanupFunction(async function () {
    Services.prefs.clearUserPref("mail.pane_config.dynamic");
    Services.xulStore.removeValue(
      "chrome://messenger/content/messenger.xhtml",
      "threadPane",
      "view"
    );

    const tabmail = document.getElementById("tabmail");
    if (tabmail.tabInfo.length > 1) {
      Assert.report(
        true,
        undefined,
        undefined,
        "Unexpected tab(s) open at the end of the test run"
      );
      tabmail.closeOtherTabs(0);
    }

    for (const server of MailServices.accounts.allServers) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found server ${server.key} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
    for (const account of MailServices.accounts.accounts) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found account ${account.key} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }

    // Some tests that open new windows confuse mochitest, which waits for a
    // focus event on the main window, and the test times out. If we focus a
    // different window (browser-harness.xhtml should be the only other window
    // at this point) then mochitest gets its focus event and the test ends.
    await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
  });
});

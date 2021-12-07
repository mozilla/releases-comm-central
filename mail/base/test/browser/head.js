/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function focusWindow(win) {
  win.focus();
  await TestUtils.waitForCondition(
    () => Services.focus.focusedWindow.browsingContext.topChromeWindow == win,
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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test link previews.
 */

var { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/composition/html/linkpreview.html";

add_task(async function previewEnabled() {
  Services.prefs.setBoolPref("mail.compose.add_link_preview", true);
  const win = await open_compose_new_mail();
  await navigator.clipboard.writeText(url);

  const messageEditor = win.document.getElementById("messageEditor");
  messageEditor.focus();

  // Ctrl+V = Paste
  EventUtils.synthesizeKey("v", { shiftKey: false, accelKey: true }, win);

  await TestUtils.waitForCondition(
    () => messageEditor.contentDocument.body.querySelector(".moz-card"),
    "link preview should have appeared"
  );

  await close_compose_window(win);
  Services.prefs.clearUserPref("mail.compose.add_link_preview");
});

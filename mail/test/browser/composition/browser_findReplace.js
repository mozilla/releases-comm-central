/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Find and Replace dialog (Ctrl+H) in the compose window.
 */

"use strict";

var {
  close_compose_window,
  get_compose_body,
  open_compose_new_mail,
  type_in_composer,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);

add_task(async function test_find_replace_all() {
  const cwc = await open_compose_new_mail();

  cwc.document.getElementById("messageEditor").focus();
  type_in_composer(cwc, ["Apples or oranges? I like apples"]);

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/messengercompose/EdReplace.xhtml",
    {
      async callback(dialogWin) {
        const doc = dialogWin.document;

        const findInput = doc.getElementById("dialog.findInput");
        findInput.value = "apples";
        findInput.dispatchEvent(new Event("input"));

        doc.getElementById("dialog.replaceInput").value = "pears";

        EventUtils.synthesizeMouseAtCenter(
          doc.getElementById("replaceAll"),
          {},
          dialogWin
        );

        doc.documentElement.querySelector("dialog").cancelDialog();
      },
    }
  );

  EventUtils.synthesizeKey("h", { accelKey: true }, cwc);
  await dialogPromise;

  Assert.ok(
    !get_compose_body(cwc).textContent.includes("apples"),
    "editor should no longer contain 'apples'"
  );

  await close_compose_window(cwc);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { be_in_folder, get_special_folder, press_delete, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

/**
 * Check that auto-save doesn't move focus back to a field focused during an
 * earlier manual save. See bug 2082190.
 *
 * @param {string} manualField - The field focused during the manual save.
 * @param {string} autoField - The field focused during the auto-save.
 */
async function checkAutosaveFocus(manualField, autoField) {
  const win = await open_compose_new_mail();
  const subject = win.document.getElementById("msgSubject");
  const body = win.document.getElementById("messageEditor");
  const fields = { subject, body };

  await setup_msg_contents(
    win,
    "recipient@example.invalid",
    "Auto-save focus test",
    "Initial body text"
  );

  fields[manualField].focus();
  Assert.equal(win.document.activeElement, fields[manualField]);
  let savePromise = BrowserTestUtils.waitForEvent(win, "aftersave");
  await win.SaveAsDraft();
  await savePromise;
  Assert.equal(
    win.document.activeElement,
    fields[manualField],
    "Manual save restores focus"
  );

  fields[autoField].focus();
  EventUtils.sendString(" more text", win);
  Assert.equal(win.document.activeElement, fields[autoField]);

  savePromise = BrowserTestUtils.waitForEvent(win, "aftersave");
  await win.AutoSave();
  await savePromise;
  Assert.equal(
    win.document.activeElement,
    fields[autoField],
    `Auto-save keeps the focus in ${autoField} instead of ${manualField}`
  );

  await close_compose_window(win);
}

add_task(async function test_autosave_preserves_current_focus() {
  // Use a long interval so only the explicit call to AutoSave() runs.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.compose.autosave", true],
      ["mail.compose.autosaveinterval", 10],
    ],
  });

  await checkAutosaveFocus("body", "subject");
  await checkAutosaveFocus("subject", "body");

  // Remove the drafts created by both cases, including any previous draft
  // versions that remain while asynchronous saves complete.
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true
  );
  await be_in_folder(draftsFolder);
  while (draftsFolder.getTotalMessages(false) > 0) {
    const previousCount = draftsFolder.getTotalMessages(false);
    await select_click_row(0);
    await press_delete(window);
    await TestUtils.waitForCondition(
      () => draftsFolder.getTotalMessages(false) < previousCount,
      "The selected draft was deleted"
    );
  }
});

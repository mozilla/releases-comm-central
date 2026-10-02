/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the backend asking for an auto-compaction (via the
 * "mail:auto-compact-threshold-reached" notification) puts the question to the
 * user, and that the answer is respected.
 *
 * @see nsMsgDBFolder::HandleAutoCompactEvent()
 */

const TOPIC = "mail:auto-compact-threshold-reached";
// 10 MiB, so the formatted size is predictable.
const EXPUNGED_BYTES = 10 * 1024 * 1024;

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

/**
 * Fire the notification and wait for the dialog it should open. The dialog is
 * modal, so notifyObservers() doesn't return until it closes; fire it off the
 * current task rather than awaiting it.
 *
 * @returns {Window} The opened dialog.
 */
async function notifyAndWaitForDialog() {
  const dialogPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win =>
      win.document.documentURI ==
      "chrome://messenger/content/compactFoldersDialog.xhtml"
  );
  executeSoon(() =>
    Services.obs.notifyObservers(null, TOPIC, String(EXPUNGED_BYTES))
  );
  return dialogPromise;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [["mail.purge.ask", true]] });
});

add_task(async function testDeclining() {
  const dialog = await notifyAndWaitForDialog();

  Assert.stringContains(
    dialog.document.getElementById("compactFoldersText").textContent,
    MailUtils.formatFileSize(EXPUNGED_BYTES, true),
    "the dialog should say how much space compacting would reclaim"
  );

  const closed = BrowserTestUtils.domWindowClosed(dialog);
  dialog.document.querySelector("dialog").getButton("cancel").click();
  await closed;

  Assert.ok(
    Services.prefs.getBoolPref("mail.purge.ask"),
    "declining should leave the user being asked next time"
  );
});

add_task(async function testAcceptingAndNotAskingAgain() {
  const dialog = await notifyAndWaitForDialog();

  dialog.document.getElementById("neverAskCheckbox").checked = true;
  dialog.document.querySelector("dialog").getButton("accept").click();

  // The dialog is modal, so the code acting on the answer only runs as the
  // nested event loop unwinds, which is after domWindowClosed resolves.
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref("mail.purge.ask"),
    "ticking the checkbox should stop the user being asked again"
  );
});

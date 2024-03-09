/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a reply to a multipart/alternative message with two
 * encrypted parts doesn't leak the secret plaintext from the second
 * part.
 */

"use strict";

var { close_compose_window, get_msg_source, open_compose_with_reply } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var {
  be_in_folder,
  get_special_folder,
  open_message_from_file,
  press_delete,
  select_click_row,
  smimeUtils_ensureNSS,
  smimeUtils_loadCertificateAndKey,
  smimeUtils_loadPEMCertificate,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var gDrafts;

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", true);
});

add_task(async function test_multipart_alternative() {
  smimeUtils_ensureNSS();
  smimeUtils_loadPEMCertificate(
    new FileUtils.File(getTestFilePath("data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  smimeUtils_loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Bob.p12"), "nss")
  );

  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/multipart-alternative.eml"))
  );

  const cwc = await open_compose_with_reply(msgc);

  await BrowserTestUtils.closeWindow(msgc);

  // Now save the message as a draft.
  EventUtils.synthesizeKey("s", { shiftKey: false, accelKey: true }, cwc);
  await TestUtils.waitForCondition(
    () => !cwc.gSaveOperationInProgress && !cwc.gWindowLock,
    "Saving of draft did not finish"
  );
  await close_compose_window(cwc);

  // Now check the message content in the drafts folder.
  await be_in_folder(gDrafts);
  const message = await select_click_row(0);
  const messageContent = await get_msg_source(message);

  // Check for a single line that contains text and make sure there is a
  // space at the end for a flowed reply.
  Assert.ok(
    !messageContent.includes("SECRET-TEXT"),
    "Secret text was found, but shouldn't be there."
  );

  // Delete the outgoing message.
  await press_delete();
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();
});

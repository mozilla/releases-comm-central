/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a reply to a multipart/alternative message with two
 * encrypted parts doesn't leak the secret plaintext from the second
 * part.
 */

"use strict";

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

var {
  close_compose_window,
  get_msg_source,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  assert_false,
  be_in_folder,
  get_special_folder,
  open_message_from_file,
  press_delete,
  select_click_row,
  smimeUtils_ensureNSS,
  smimeUtils_loadCertificateAndKey,
  smimeUtils_loadPEMCertificate,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gDrafts;

function setupModule(module) {
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", true);
}

function get_file_for_path(path) {
  return os.getFileForPath(os.abspath(path, os.getFileForPath(__file__)));
}

function test_multipart_alternative() {
  smimeUtils_ensureNSS();
  smimeUtils_loadPEMCertificate(
    get_file_for_path("./TestCA.pem"),
    Ci.nsIX509Cert.CA_CERT
  );
  smimeUtils_loadCertificateAndKey(get_file_for_path("./Bob.p12"));

  let msgc = open_message_from_file(
    get_file_for_path("./multipart-alternative.eml")
  );

  let cwc = open_compose_with_reply(msgc);

  close_window(msgc);

  // Now save the message as a draft.
  cwc.keypress(null, "s", { shiftKey: false, accelKey: true });
  close_compose_window(cwc);

  // Now check the message content in the drafts folder.
  be_in_folder(gDrafts);
  let message = select_click_row(0);
  let messageContent = get_msg_source(message);

  // Check for a single line that contains text and make sure there is a
  // space at the end for a flowed reply.
  assert_false(
    messageContent.includes("SECRET-TEXT"),
    "Secret text was found, but shouldn't be there."
  );

  // Delete the outgoing message.
  press_delete();
}

function teardownModule() {
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");
}

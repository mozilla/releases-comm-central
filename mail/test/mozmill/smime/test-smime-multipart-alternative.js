/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a reply to a multipart/alternative message with two
 * encrypted parts doesn't leak the secret plaintext from the second
 * part.
 */

"use strict";

/* import-globals-from ../shared-modules/test-compose-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-smime-multipart-alternative";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "compose-helpers",
  "window-helpers",
];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

var gDrafts;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

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

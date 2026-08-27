/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that nsIEncryptedSMIMEURIsService recognizes an encrypted message
 * regardless of which valid URI representation was used to register it or to
 * look it up.
 */

const service = Cc[
  "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
].getService(Ci.nsIEncryptedSMIMEURIsService);

// Parsing a mailbox: or file: URL converts its path to an nsIFile, and a URL
// that fails to parse isn't normalized at all. Derive the paths used below from
// the profile so they are absolute in the form the platform expects; the files
// need not exist.
function urlPathFor(leafName) {
  const file = do_get_profile();
  file.append(leafName);
  return Services.io.newFileURI(file).QueryInterface(Ci.nsIURL).filePath;
}

const FOLDER_PATH = urlPathFor("Inbox");

// Two representations of the same message that differ only in volatile query
// bits; they must be treated as the same message.
const DISPLAY_URL = `mailbox://${FOLDER_PATH}?type=application/x-message-display&number=7`;
const NECKO_URL = `mailbox://${FOLDER_PATH}?number=7`;

// A different message in the same folder; must never be confused with the one
// above.
const OTHER_MSG_URL = `mailbox://${FOLDER_PATH}?number=8`;

add_task(function test_differentQueryRepresentationsMatch() {
  service.rememberEncrypted(NECKO_URL);

  Assert.ok(
    service.isEncrypted(DISPLAY_URL),
    "the display URL must match the registered necko URL for the same message"
  );
  Assert.ok(
    service.isEncrypted(NECKO_URL),
    "the exact registered representation must still match"
  );
  Assert.ok(
    !service.isEncrypted(OTHER_MSG_URL),
    "a different message in the same folder must not be treated as encrypted"
  );

  service.forgetEncrypted(NECKO_URL);
  Assert.ok(
    !service.isEncrypted(DISPLAY_URL),
    "forgetting one representation must clear the other"
  );
});

add_task(function test_symmetricRegistration() {
  service.rememberEncrypted(DISPLAY_URL);

  Assert.ok(
    service.isEncrypted(NECKO_URL),
    "the necko URL must match the registered display URL"
  );

  service.forgetEncrypted(DISPLAY_URL);
  Assert.ok(!service.isEncrypted(NECKO_URL), "cleanup");
});

add_task(function test_dualRegistrationForgetsCleanly() {
  // Both representations normalize to the same key; forgetting both must clear
  // it.
  service.rememberEncrypted(NECKO_URL);
  service.rememberEncrypted(DISPLAY_URL);
  Assert.ok(service.isEncrypted(DISPLAY_URL), "registered");

  service.forgetEncrypted(NECKO_URL);
  service.forgetEncrypted(DISPLAY_URL);
  Assert.ok(
    !service.isEncrypted(DISPLAY_URL),
    "both forget calls must remove the message"
  );
  Assert.ok(!service.isEncrypted(NECKO_URL), "and under either form");
});

add_task(function test_distinctMessagesStayDistinct() {
  service.rememberEncrypted(`mailbox://${FOLDER_PATH}?number=5`);

  Assert.ok(
    service.isEncrypted(`mailbox://${FOLDER_PATH}?number=5`),
    "exact folder lookup still matches"
  );
  Assert.ok(
    !service.isEncrypted(`mailbox://${FOLDER_PATH}?number=6`),
    "a different message number must not match"
  );

  service.forgetEncrypted(`mailbox://${FOLDER_PATH}?number=5`);
  Assert.ok(
    !service.isEncrypted(`mailbox://${FOLDER_PATH}?number=5`),
    "cleanup"
  );
});

add_task(function test_fileOpenedMatchesMailboxDisplay() {
  // A message opened from a file is registered as a file:// URL but displayed,
  // and checked by the content policy, as mailbox:///<path>?...&number=0; both
  // must resolve to the same message.
  const filePath = urlPathFor("msg.eml");
  const fileURL = `file://${filePath}?type=application/x-message-display`;
  const mailboxDisplayURL = `mailbox://${filePath}?type=application/x-message-display&number=0`;
  service.rememberEncrypted(fileURL);

  Assert.ok(
    service.isEncrypted(mailboxDisplayURL),
    "the mailbox display lookup must match the file-registered message"
  );
  Assert.ok(
    service.isEncrypted(fileURL),
    "the file representation must still match"
  );

  service.forgetEncrypted(fileURL);
  Assert.ok(
    !service.isEncrypted(mailboxDisplayURL),
    "forgetting the file URL must clear the mailbox lookup too"
  );

  // A ref can never select a different message in a single-message .eml, so a
  // file URL carrying one must still map to the mailbox display form.
  const fileURLWithRef = fileURL + "#anchor";
  service.rememberEncrypted(fileURLWithRef);
  Assert.ok(
    service.isEncrypted(mailboxDisplayURL),
    "a file URL with a ref must still match the mailbox display form"
  );
  service.forgetEncrypted(fileURLWithRef);
  Assert.ok(!service.isEncrypted(mailboxDisplayURL), "cleanup");
});

add_task(function test_messageURIsStayDistinct() {
  // Message URIs carry the message key in the ref, which normalizedSpec strips,
  // so they are matched by exact spec rather than normalized; distinct messages
  // must not collapse.
  const msg123 = "mailbox-message://Local%20Folders/Inbox#123";
  const msg124 = "mailbox-message://Local%20Folders/Inbox#124";
  service.rememberEncrypted(msg123);

  Assert.ok(service.isEncrypted(msg123), "the exact message URI matches");
  Assert.ok(
    !service.isEncrypted(msg124),
    "a sibling message in the same folder must not collapse onto it"
  );

  service.forgetEncrypted(msg123);
  Assert.ok(!service.isEncrypted(msg123), "cleanup");
});

add_task(function test_emptyURIIsRejected() {
  // An empty key would match every other lookup that produced one, so an empty
  // URI must be rejected rather than stored.
  // NS_ERROR_INVALID_ARG is an alias of NS_ERROR_ILLEGAL_VALUE, which is the
  // name reported to callers.
  Assert.throws(
    () => service.rememberEncrypted(""),
    /NS_ERROR_ILLEGAL_VALUE/,
    "registering an empty URI must fail"
  );
  Assert.throws(
    () => service.forgetEncrypted(""),
    /NS_ERROR_ILLEGAL_VALUE/,
    "forgetting an empty URI must fail"
  );
  Assert.ok(
    !service.isEncrypted(""),
    "an empty URI must never be reported as encrypted"
  );
});

add_task(function test_unnormalizableSchemeExactMatch() {
  // URIs that are not mailnews message URLs fall back to exact raw-spec matching.
  const a = "data:text/plain,hello";
  const b = "data:text/plain,world";
  service.rememberEncrypted(a);

  Assert.ok(service.isEncrypted(a), "raw-spec exact match still works");
  Assert.ok(!service.isEncrypted(b), "a different raw spec must not match");

  service.forgetEncrypted(a);
  Assert.ok(!service.isEncrypted(a), "cleanup");
});

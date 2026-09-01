/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that nsIEncryptedMsgURIsService recognizes an encrypted message
 * regardless of which valid URI representation was used to register it or to
 * look it up.
 */

const service = Cc[
  "@mozilla.org/messenger/encrypted-msg-uris-service;1"
].getService(Ci.nsIEncryptedMsgURIsService);

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

// The "integrity protected" dimension (bug 1994709). The remote-content gate in
// nsMsgContentPolicy blocks remote content for an encrypted message iff the
// service reports isEncryptedWithoutIntegrity(); the integrity state is keyed on
// the same normalized key as the encrypted state.

add_task(function test_integrity_unknownUri() {
  const uri = `mailbox://${FOLDER_PATH}?number=20`;
  Assert.ok(!service.isEncrypted(uri), "unknown URI should not be encrypted");
  Assert.ok(
    !service.isEncryptedWithoutIntegrity(uri),
    "an unknown URI should not be an encrypted URI lacking integrity"
  );
});

add_task(function test_integrity_defaultIsNotProtected() {
  // S/MIME (and any caller that omits the flag) must never be reported as
  // integrity protected -> stays hard-blocked.
  const uri = `mailbox://${FOLDER_PATH}?number=21`;
  service.rememberEncrypted(uri);
  Assert.ok(service.isEncrypted(uri), "remembered as encrypted");
  Assert.ok(
    service.isEncryptedWithoutIntegrity(uri),
    "default (no flag) is not integrity protected"
  );
  service.forgetEncrypted(uri);
});

add_task(function test_integrity_explicitFalse() {
  const uri = `mailbox://${FOLDER_PATH}?number=22`;
  service.rememberEncrypted(uri, false);
  Assert.ok(service.isEncrypted(uri));
  Assert.ok(
    service.isEncryptedWithoutIntegrity(uri),
    "explicit false is not protected"
  );
  service.forgetEncrypted(uri);
});

add_task(function test_integrity_protected() {
  const uri = `mailbox://${FOLDER_PATH}?number=23`;
  service.rememberEncrypted(uri, true);
  Assert.ok(service.isEncrypted(uri));
  Assert.ok(!service.isEncryptedWithoutIntegrity(uri), "integrity protected");
  service.forgetEncrypted(uri);
  Assert.ok(!service.isEncrypted(uri));
  Assert.ok(
    !service.isEncryptedWithoutIntegrity(uri),
    "integrity state cleared after forget"
  );
});

add_task(function test_integrity_trueThenFalseIsUnprotected() {
  // If any registration of a URI lacks integrity protection, the URI must not
  // be reported as integrity protected, even if another registration claimed
  // it was. Producers with different guarantees may register the same URI in
  // either order.
  const uri = `mailbox://${FOLDER_PATH}?number=24`;
  service.rememberEncrypted(uri, true);
  Assert.ok(
    !service.isEncryptedWithoutIntegrity(uri),
    "protected after first register"
  );
  service.rememberEncrypted(uri, false);
  Assert.ok(
    service.isEncryptedWithoutIntegrity(uri),
    "poisoned: a later unprotected register wins"
  );
  Assert.ok(service.isEncrypted(uri), "still encrypted, still blocked");
  service.forgetEncrypted(uri);
  service.forgetEncrypted(uri);
  Assert.ok(!service.isEncrypted(uri));
});

add_task(function test_integrity_falseThenTrueStaysUnprotected() {
  const uri = `mailbox://${FOLDER_PATH}?number=25`;
  service.rememberEncrypted(uri, false);
  service.rememberEncrypted(uri, true);
  Assert.ok(
    service.isEncryptedWithoutIntegrity(uri),
    "poison persists: cannot upgrade to protected within a session"
  );
  service.forgetEncrypted(uri);
  service.forgetEncrypted(uri);
  Assert.ok(!service.isEncrypted(uri));
});

add_task(function test_integrity_forgetRefcountThenCleanSlate() {
  const uri = `mailbox://${FOLDER_PATH}?number=26`;
  // Two protected registrations (message URI + necko URL both remembered, and
  // reloads can add more).
  service.rememberEncrypted(uri, true);
  service.rememberEncrypted(uri, true);
  service.forgetEncrypted(uri);
  Assert.ok(service.isEncrypted(uri), "still encrypted after one forget");
  Assert.ok(
    !service.isEncryptedWithoutIntegrity(uri),
    "still protected after one forget"
  );
  service.forgetEncrypted(uri);
  Assert.ok(!service.isEncrypted(uri), "fully forgotten");

  // A fresh, unprotected display of the same URI must start from a clean slate.
  service.rememberEncrypted(uri, false);
  Assert.ok(
    service.isEncryptedWithoutIntegrity(uri),
    "clean slate, now unprotected"
  );
  service.forgetEncrypted(uri);
});

add_task(function test_integrity_requiresEncrypted() {
  const uri = `mailbox://${FOLDER_PATH}?number=27`;
  service.rememberEncrypted(uri, true);
  service.forgetEncrypted(uri);
  Assert.ok(!service.isEncrypted(uri));
  Assert.ok(
    !service.isEncryptedWithoutIntegrity(uri),
    "a forgotten URI is not an encrypted URI lacking integrity"
  );
});

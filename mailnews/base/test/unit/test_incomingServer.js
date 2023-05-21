/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function subtestUID(type) {
  const UUID_REGEXP =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // Create a server and check it the UID is set when accessed.

  let serverA = MailServices.accounts.createIncomingServer(
    "userA",
    "hostA",
    type
  );
  Assert.stringMatches(
    serverA.UID,
    UUID_REGEXP,
    "server A's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.server.${serverA.key}.uid`),
    serverA.UID,
    "server A's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (serverA.UID = "00001111-2222-3333-4444-555566667777"),
    /NS_ERROR_ABORT/,
    "server A's UID should be unchangeable after it is set"
  );

  // Create a second server and check the two UIDs don't match.

  let serverB = MailServices.accounts.createIncomingServer(
    "userB",
    "hostB",
    type
  );
  Assert.stringMatches(
    serverB.UID,
    UUID_REGEXP,
    "server B's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.server.${serverB.key}.uid`),
    serverB.UID,
    "server B's UID should be saved to the preferences"
  );
  Assert.notEqual(
    serverB.UID,
    serverA.UID,
    "server B's UID should not be the same as server A's"
  );

  // Create a third server and set the UID before it is accessed.

  let serverC = MailServices.accounts.createIncomingServer(
    "userC",
    "hostC",
    type
  );
  serverC.UID = "11112222-3333-4444-5555-666677778888";
  Assert.equal(
    serverC.UID,
    "11112222-3333-4444-5555-666677778888",
    "server C's UID set correctly"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.server.${serverC.key}.uid`),
    "11112222-3333-4444-5555-666677778888",
    "server C's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (serverC.UID = "22223333-4444-5555-6666-777788889999"),
    /NS_ERROR_ABORT/,
    "server C's UID should be unchangeable after it is set"
  );
}

/**
 * Tests the UID attribute of IMAP servers.
 */
add_task(function testUID_IMAP() {
  subtestUID("imap");
});

/**
 * Tests the UID attribute of NNTP servers.
 */
add_task(function testUID_NNTP() {
  subtestUID("nntp");
});

/**
 * Tests the UID attribute of POP3 servers.
 */
add_task(function testUID_POP3() {
  subtestUID("pop3");
});

/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for the SMTP implementation of nsIMsgOutgoingServer.
 */

/**
 * Test that cached server password is cleared when password storage changed.
 */
add_task(async function test_passwordmgr_change() {
  // Create an nsIMsgOutgoingServer instance for SMTP and set a password.
  const server = Cc[
    "@mozilla.org/messenger/outgoing/server;1?type=smtp"
  ].createInstance(Ci.nsIMsgOutgoingServer);
  server.password = "smtp-pass";
  equal(server.password, "smtp-pass", "Password should be cached.");

  // Trigger the change event of password manager.
  Services.logins.setLoginSavingEnabled("smtp://localhost", false);
  equal(server.password, "", "Password should be cleared.");
});

/**
 * Test getter/setter of attributes.
 */
add_task(async function test_attributes() {
  // Create an nsIMsgOutgoingServer instance for SMTP and set a password.
  const server = Cc[
    "@mozilla.org/messenger/outgoing/server;1?type=smtp"
  ].createInstance(Ci.nsIMsgOutgoingServer);

  server.description = "アイウ";
  equal(server.description, "アイウ", "Description should be correctly set.");

  const smtpServer = server.QueryInterface(Ci.nsISmtpServer);
  smtpServer.hostname = "サービス.jp";

  equal(
    smtpServer.hostname,
    "サービス.jp",
    "Hostname should be correctly set."
  );
});

/**
 * Tests the UID attribute of servers.
 */
add_task(async function testUID() {
  const UUID_REGEXP =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // Create a server and check it the UID is set when accessed.

  const serverA = MailServices.outgoingServer.createServer("smtp");
  Assert.stringMatches(
    serverA.UID,
    UUID_REGEXP,
    "server A's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.smtpserver.${serverA.key}.uid`),
    serverA.UID,
    "server A's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (serverA.UID = "00001111-2222-3333-4444-555566667777"),
    /NS_ERROR_ABORT/,
    "server A's UID should be unchangeable after it is set"
  );

  // Create a second server and check the two UIDs don't match.

  const serverB = MailServices.outgoingServer.createServer("smtp");
  Assert.stringMatches(
    serverB.UID,
    UUID_REGEXP,
    "server B's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.smtpserver.${serverB.key}.uid`),
    serverB.UID,
    "server B's UID should be saved to the preferences"
  );
  Assert.notEqual(
    serverB.UID,
    serverA.UID,
    "server B's UID should not be the same as server A's"
  );

  // Create a third server and set the UID before it is accessed.

  const serverC = MailServices.outgoingServer.createServer("smtp");
  serverC.UID = "11112222-3333-4444-5555-666677778888";
  Assert.equal(
    serverC.UID,
    "11112222-3333-4444-5555-666677778888",
    "server C's UID set correctly"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.smtpserver.${serverC.key}.uid`),
    "11112222-3333-4444-5555-666677778888",
    "server C's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (serverC.UID = "22223333-4444-5555-6666-777788889999"),
    /NS_ERROR_ABORT/,
    "server C's UID should be unchangeable after it is set"
  );
});

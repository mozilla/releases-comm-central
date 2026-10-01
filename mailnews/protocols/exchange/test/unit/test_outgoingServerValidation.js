/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests validation at initialization for Exchange outgoing servers.
 *
 * These tests rely on the fact that tests that successfully create a new server
 * also delete it at the end. This empties the outgoing service's list and
 * forces it to read the `mail.smtpservers` next time we call `getServerByKey`.
 */

/**
 * Tests that creating a new outgoing server works.
 */
add_task(function test_outgoing_server_created() {
  const server = MailServices.outgoingServer.createServer("ews");
  Assert.ok(server, "the server should have been created");
  const servers = Services.prefs.getCharPref("mail.smtpservers", "").split(",");
  Assert.ok(
    servers.includes(server.key),
    "the server's key should be included in the outgoing service's prefs"
  );
  MailServices.outgoingServer.deleteServer(server);
});

/**
 * Tests that loading an outgoing server from prefs works when all of the
 * required prefs are set.
 */
add_task(function test_outgoing_server_load_required_prefs() {
  const serverKey = "ews1";

  Services.prefs.setCharPref("mail.smtpservers", serverKey);
  Services.prefs.setCharPref(`mail.smtpserver.${serverKey}.type`, "ews");
  Services.prefs.setCharPref(
    `mail.outgoingserver.${serverKey}.username`,
    "jdoe@test.test"
  );
  Services.prefs.setIntPref(`mail.outgoingserver.${serverKey}.auth_method`, 10);
  Services.prefs.setCharPref(
    `mail.outgoingserver.${serverKey}.ews_url`,
    "http://example.test"
  );

  const server = MailServices.outgoingServer.getServerByKey(serverKey);
  Assert.ok(server, "the server should have been created");
  MailServices.outgoingServer.deleteServer(server);
});

/**
 * Tests that loading an outgoing server from prefs fails when none of the
 * required prefs are set.
 */
add_task(function test_outgoing_server_load_empty_prefs() {
  const serverKey = "ews1";

  Services.prefs.setCharPref("mail.smtpservers", serverKey);
  Services.prefs.setCharPref(`mail.smtpserver.${serverKey}.type`, "ews");

  const server = MailServices.outgoingServer.getServerByKey(serverKey);
  Assert.ok(!server, "the server should not have been created");

  cleanupPrefs(serverKey);
});

/**
 * Tests that loading an outgoing server from prefs fails when only some of the
 * required prefs are set.
 */
add_task(function test_outgoing_server_load_some_required_prefs_missing() {
  const serverKey = "ews1";

  Services.prefs.setCharPref("mail.smtpservers", serverKey);
  Services.prefs.setCharPref(`mail.smtpserver.${serverKey}.type`, "ews");
  Services.prefs.setCharPref(
    `mail.outgoingserver.${serverKey}.username`,
    "jdoe@test.test"
  );

  const server = MailServices.outgoingServer.getServerByKey(serverKey);
  Assert.ok(!server, "the server should not have been created");

  cleanupPrefs(serverKey);
});

/**
 * Tests that, when we create a new server, we still perform the validation when
 * sending.
 */
add_task(function test_outgoing_server_create_then_send_missing_prefs() {
  const server = MailServices.outgoingServer.createServer("ews");
  Assert.ok(server, "the server should have been created");

  // We don't actually need those two (not even the listener since we expect
  // `sendMailMessage` to throw immediately), but XPCOM is unhappy if they're
  // missing.
  const testFile = do_get_file("data/simple_email.eml");
  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();

  Assert.throws(
    () =>
      server.sendMailMessage(
        testFile,
        [],
        [],
        {},
        null,
        null,
        null,
        false,
        "testmessage@local.test",
        listener
      ),
    /NS_ERROR_UNEXPECTED/,
    "the server should also perform some validation when sending"
  );
});

/**
 * Clean-up leftover prefs after a test that (expectedly) failed to create an
 * outgoing server.
 *
 * @param {string} key - The key of the server we want to cleanup.
 */
function cleanupPrefs(key) {
  Services.prefs.clearUserPref("mail.smtpservers");
  Services.prefs.deleteBranch(`mail.smtpserver.${key}`);
  Services.prefs.deleteBranch(`mail.outgoingserver.${key}`);
}

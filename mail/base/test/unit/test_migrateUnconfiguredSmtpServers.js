/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that SMTP servers left behind unconfigured by an interrupted account
 * setup are removed. See bug 2069949.
 */

var { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

add_task(async function test_migrateUnconfiguredSmtpServers() {
  const configured = localAccountUtils.create_outgoing_server(
    "smtp",
    "username",
    "password",
    { hostname: "smtp.invalid", port: 1234 }
  );
  // A server as createServer() leaves it, before a hostname has been set.
  const unconfigured = MailServices.outgoingServer.createServer("smtp");
  unconfigured.description = "Leftover";
  unconfigured.username = "username";
  MailServices.outgoingServer.defaultServer = unconfigured;

  // allIdentities only reports identities that belong to an account.
  const account = MailServices.accounts.createAccount();
  account.incomingServer = localAccountUtils.create_incoming_server(
    "pop3",
    1234,
    "username",
    "password"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.smtpServerKey = unconfigured.key;
  account.addIdentity(identity);
  const otherIdentity = MailServices.accounts.createIdentity();
  otherIdentity.smtpServerKey = configured.key;
  account.addIdentity(otherIdentity);

  Services.prefs.setIntPref("mail.ui-rdf.version", 64);
  MailMigrator._migrateUI();

  Assert.deepEqual(
    MailServices.outgoingServer.servers.map(server => server.key),
    [configured.key],
    "the unconfigured server should have been removed"
  );
  Assert.equal(
    Services.prefs.getStringPref(
      `mail.smtpserver.${unconfigured.key}.description`,
      ""
    ),
    "",
    "the removed server's preferences should have been cleared"
  );
  Assert.equal(
    MailServices.outgoingServer.defaultServer.key,
    configured.key,
    "the remaining server should have become the default"
  );
  Assert.ok(
    !identity.smtpServerKey,
    "an identity using the removed server should no longer name one"
  );
  Assert.equal(
    MailServices.outgoingServer.getServerByIdentity(identity)?.key,
    configured.key,
    "that identity should resolve to the default server"
  );
  Assert.equal(
    otherIdentity.smtpServerKey,
    configured.key,
    "an identity using another server should be left alone"
  );
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function test_ews_client_m365_pref() {
  const [, incomingServer] = setupBasicEwsTestServer({});

  // Set up a non-M365 server.
  // eslint-disable-next-line no-unused-vars
  const nonM365Client = MailServices.protocolClient.createTestClient(
    "ews",
    incomingServer.getStringValue("ews_url"),
    incomingServer
  );
  Assert.ok(
    !Services.prefs.getBoolPref("mail.exchange.hasMicrosoft365EwsAccount"),
    "Pref should not be set for non-Microsoft 365 subdomains"
  );

  // Set up a M365 server.
  // It's ok to use this URL in a test because the client initialize doesn't
  // establish the connection.
  // eslint-disable-next-line no-unused-vars
  const m365Client = MailServices.protocolClient.createTestClient(
    "ews",
    "https://example.office365.com",
    incomingServer
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.exchange.hasMicrosoft365EwsAccount"),
    "Pref should be set for Microsoft 365 subdomains"
  );

  MailServices.protocolClient.shutdownTestClients();
});

add_task(async function test_client_sharing() {
  const [, incomingServer] = setupBasicEwsTestServer({});

  const client = MailServices.protocolClient.getClient(
    "ews",
    incomingServer.getStringValue("ews_url"),
    incomingServer.username
  );
  Assert.equal(
    client.incomingServerKey,
    incomingServer.key,
    "the client should be attached to the incoming server"
  );

  Assert.throws(
    () =>
      MailServices.protocolClient.getClient(
        "foo",
        "https://example.com",
        "jdoe@example.com"
      ),
    /NS_ERROR_UNEXPECTED/,
    "creating a client that does not match any known server should fail"
  );

  MailServices.protocolClient.shutdownClient(client);
});

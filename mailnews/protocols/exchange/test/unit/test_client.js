/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_ews_client_m365_pref() {
  const [, incomingServer] = setupBasicEwsTestServer({});

  // Set up a non-M365 server.
  const nonM365Client = Cc[
    "@mozilla.org/messenger/ews-client;1"
  ].createInstance(Ci.IExchangeClient);
  nonM365Client.initialize(
    incomingServer.getStringValue("ews_url"),
    incomingServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );
  Assert.ok(
    !Services.prefs.getBoolPref("mail.exchange.hasMicrosoft365EwsAccount"),
    "Pref should not be set for non-Microsoft 365 subdomains"
  );

  // Set up a M365 server.
  // It's ok to use this URL in a test because the client initialize doesn't
  // establish the connection.
  const m365Client = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IExchangeClient
  );
  m365Client.initialize(
    "https://example.office365.com",
    incomingServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.exchange.hasMicrosoft365EwsAccount"),
    "Pref should be set for Microsoft 365 subdomains"
  );
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The mock EWS server to direct our traffic to.
var ewsServer;

// The `nsIMsgOutgoingServer` instance used to send messages using EWS.
var outgoingServer;

add_setup(() => {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer({
    username: "alice@local.test",
    password: "thispassword",
  });
  ewsServer.start();

  // Create and initialize an EWS outgoing server.
  outgoingServer = MailServices.outgoingServer.createServer("ews");
  const ewsOutgoingServer = outgoingServer.QueryInterface(Ci.nsIEwsServer);
  ewsOutgoingServer.initialize(
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  registerCleanupFunction(() => {
    ewsServer.stop();
    MailServices.outgoingServer.deleteServer(outgoingServer);
    Services.logins.removeAllLogins();
  });
});

/**
 * Tests that the EWS outgoing server implementation properly authenticates when
 * configured to use Basic (password) auth.
 */
add_task(async function test_basic_auth() {
  // We need on-disk storage for the login manager to work.
  do_get_profile();

  registerCleanupFunction(() => {});

  // The credentials we'll configure on the server, and ensure it uses to
  // authenticate.
  const password = "thispassword";
  const username = "alice@local.test";

  // Configure the outgoing server to use Basic/password auth (which we map to
  // `nsMsgAuthMethod.passwordCleartext`).
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  outgoingServer.username = username;

  // Store the password in the login manager. Note that the URI we use does not
  // include the port.
  const passwordURI = "ews://127.0.0.1";
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  login.init(
    passwordURI,
    null,
    passwordURI,
    outgoingServer.username,
    password,
    "",
    ""
  );
  await Services.logins.addLoginAsync(login);

  // Send the dummy message, and wait for the request to complete.
  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  const testFile = do_get_file("data/simple_email.eml");
  outgoingServer.sendMailMessage(
    testFile,
    [],
    [],
    {},
    null,
    null,
    {},
    false,
    "testmessage@local.test",
    listener
  );
  await listener.promise;

  // Ensure the `Authorization` header's value from the previous request is
  // correctly formatted, and makes an attempt to authenticate using Basic auth
  // and the credentials we've previously configured.
  Assert.greater(
    ewsServer.lastAuthorizationValue.length,
    0,
    "the value for the Authorization header should not be empty"
  );

  const parts = ewsServer.lastAuthorizationValue.split(" ");
  Assert.equal(
    parts.length,
    2,
    "the value for the Authorization header should contain exactly two values"
  );
  Assert.equal(parts[0], "Basic", "the EWS client should use Basic auth");
  Assert.equal(
    parts[1],
    btoa(`${username}:${password}`),
    "the credentials should match those configured for this server"
  );
});

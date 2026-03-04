/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

// The mock EWS server to direct our traffic to.
var ewsServer;

// The `nsIMsgOutgoingServer` instance used to send messages using EWS.
var outgoingServer;

// The credentials to use for authenticating on the server.
const username = "alice@local.test";
const password = "thispassword";

add_setup(async () => {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer({
    username,
    password,
  });
  ewsServer.start();

  // Create and initialize an EWS outgoing server.
  outgoingServer = MailServices.outgoingServer.createServer("ews");
  const ewsOutgoingServer = outgoingServer.QueryInterface(Ci.nsIEwsServer);
  ewsOutgoingServer.initialize(
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

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
    null,
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

/**
 * Tests that a sent message is correctly moved to the folder with the
 * "sentitems" distinguished folder ID (herein refered to as the "FCC" folder).
 */
add_task(async function test_moved_to_fcc_folder() {
  // Create an incoming server so we can check the content of the FCC folder
  // later.
  const incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    username,
    password
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  // Associate the outgoing server to the account and retrieve the resulting
  // `nsIMsgIdentity`, since we'll need it for sending the message.
  const account = MailServices.accounts.findAccountForServer(incomingServer);
  localAccountUtils.associate_servers(account, outgoingServer, true);
  const identity = account.defaultIdentity;

  // Create a folder that has the correct distinguished folder ID but a name
  // that is NOT "Sent", to make sure we don't fall back onto IMAP-style logic
  // to identify folders by static names.
  const folderName = "sentItemsTest";
  ewsServer.setRemoteFolders([
    new RemoteFolder("root", null, "Root", "msgfolderroot"),
    new RemoteFolder("inbox", "root", "Inbox", "inbox"),
    new RemoteFolder(folderName, "root", folderName, "sentitems"),
  ]);

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const fccFolder = rootFolder.getChildNamed(folderName);

  // Make sure the FCC folder URI hasn't been set yet. We haven't tried sending
  // a message yet, which is (currently) when we look at folder flags to figure
  // out which folder to use. If the URI has already been set, then it means it
  // was set based on the folder's name, not its flags.
  Assert.ok(
    !identity.fccFolderURI,
    "the identity should not have an FCC folder URI yet"
  );

  Assert.equal(
    fccFolder.getTotalMessages(false),
    0,
    "before sending, the FCC folder has no message"
  );

  // Send a message from this account.
  const compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  compFields.from = identity.email;
  compFields.to = "bob@local.test";

  const msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );

  const testFile = do_get_file("data/simple_email.eml");
  const sendListener = new PromiseTestUtils.SendListener();

  msgSend.sendMessageFile(
    identity,
    "",
    compFields,
    testFile,
    false,
    false,
    Ci.nsIMsgSend.nsMsgDeliverNow,
    null,
    sendListener,
    null,
    null
  );

  await sendListener.promise;

  // A copy of the message should end up in the FCC folder.
  await TestUtils.waitForCondition(
    () => fccFolder.getTotalMessages(false) == 1,
    "waiting for sent message to be moved to the FCC folder"
  );
});

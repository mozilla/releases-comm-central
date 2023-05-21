/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let MockNntpService = {
  QueryInterface: ChromeUtils.generateQI(["nsINntpService"]),
  postMessage(messageFile, groupNames, accountKey, urlListener, msgWindow) {
    this.messageFile = messageFile;
    this.groupNames = groupNames;
    this.accountKey = accountKey;
  },
};

let MockNntpServiceFactory = {
  createInstance(aIID) {
    return MockNntpService;
  },
};

add_setup(async function () {
  let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  registrar.registerFactory(
    Components.ID("{4816dd44-fe15-4719-8cfb-a2f8ee46d787}"),
    "Mock NntpService",
    "@mozilla.org/messenger/nntpservice;1",
    MockNntpServiceFactory
  );
});

/**
 * Test that when accountKey is not passed to sendMessageFile, MessageSend can
 * get the right account key from identity.
 */
add_task(async function testAccountKey() {
  // Set up the servers.
  let server = setupServerDaemon();
  localAccountUtils.loadLocalMailAccount();
  server.start();
  let smtpServer = getBasicSmtpServer(server.port);
  let identity = getSmtpIdentity("from@foo.invalid", smtpServer);
  let account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  // Init nsIMsgSend and fields.
  let msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  let compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  compFields.from = identity.email;
  // Set the newsgroups filed so that the message will be passed to NntpService.
  compFields.newsgroups = "foo.test";

  let testFile = do_get_file("data/message1.eml");
  // Notice the second argument is accountKey.
  await msgSend.sendMessageFile(
    identity,
    "",
    compFields,
    testFile,
    false,
    false,
    Ci.nsIMsgSend.nsMsgDeliverNow,
    null,
    copyListener,
    null,
    null
  );

  // Make sure the messageFile passed to NntpService is the file we set above.
  equal(MockNntpService.messageFile, testFile);
  // Test accountKey passed to NntpService is correct.
  equal(MockNntpService.accountKey, account.key);
});

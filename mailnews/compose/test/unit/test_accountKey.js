/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MockNntpService = {
  QueryInterface: ChromeUtils.generateQI(["nsINntpService"]),
  postMessage(messageFile, groupNames, accountKey) {
    this.messageFile = messageFile;
    this.groupNames = groupNames;
    this.accountKey = accountKey;
  },
};

const MockNntpServiceFactory = {
  createInstance() {
    return MockNntpService;
  },
};

add_setup(async function () {
  const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
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
  const server = setupServerDaemon();
  localAccountUtils.loadLocalMailAccount();
  server.start();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity("from@foo.invalid", smtpServer);
  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  // Init nsIMsgSend and fields.
  const msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  const compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  compFields.from = identity.email;
  // Set the newsgroups filed so that the message will be passed to NntpService.
  compFields.newsgroups = "foo.test";

  const testFile = do_get_file("data/message1.eml");
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

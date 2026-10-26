/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

let ewsServer, incoming1, incoming2;

add_setup(async () => {
  do_get_profile();

  ewsServer = new EwsServer({
    username: "user1",
    password: "password1",
  });
  ewsServer.addAccount("user2", "password2");
  ewsServer.start();

  registerCleanupFunction(async () => {
    ewsServer.stop();
  });
});

add_task(async function testIncomingMultipleServers() {
  incoming1 = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user1",
    "password1"
  );
  incoming1.QueryInterface(Ci.IExchangeIncomingServer);
  incoming1.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  incoming2 = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user2",
    "password2"
  );
  incoming2.QueryInterface(Ci.IExchangeIncomingServer);
  incoming2.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  const root1 = incoming1.rootFolder;
  const root2 = incoming2.rootFolder;

  info("Sync account 1");
  await syncFolder(incoming1, root1);
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user1",
    "First sync should have been for 'user1'"
  );

  info("Sync account 2");
  await syncFolder(incoming2, root2);
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user2",
    "Second sync should have been for 'user2'"
  );

  // Sync account 1 again. We need to make sure we're not just using one auth
  // cache entry for the whole server, which would result in the credentials for
  // account 2 to be sent here since the underlying client, and therefore auth
  // cache entries, are created on the first request (not at initialization).
  await syncFolder(incoming1, root1);
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user1",
    "Third sync should be user1 again"
  );

  incoming1.shutdown();
  incoming1.QueryInterface(Ci.IExchangeIncomingServer);
  await TestUtils.waitForCondition(
    () => !incoming1.protocolClientRunning,
    "waiting for the EWS client to shut down"
  );

  incoming2.shutdown();
  incoming2.QueryInterface(Ci.IExchangeIncomingServer);
  await TestUtils.waitForCondition(
    () => !incoming2.protocolClientRunning,
    "waiting for the EWS client to shut down"
  );
});

add_task(async function testOutgoingMultipleServers() {
  const outgoing1 = MailServices.outgoingServer.createServer("ews");
  const exchangeOutgoing1 = outgoing1.QueryInterface(
    Ci.IExchangeOutgoingServer
  );
  exchangeOutgoing1.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  exchangeOutgoing1.username = "user1";
  exchangeOutgoing1.password = "password1";
  outgoing1.exchangeUrl = `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`;

  const outgoing2 = MailServices.outgoingServer.createServer("ews");
  const exchangeOutgoing2 = outgoing2.QueryInterface(
    Ci.IExchangeOutgoingServer
  );
  exchangeOutgoing2.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  exchangeOutgoing2.username = "user2";
  exchangeOutgoing2.password = "password2";
  outgoing2.exchangeUrl = `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`;

  const testFile = do_get_file("data/simple_email.eml");

  info("Sending as user1");
  const listener1 = new PromiseTestUtils.PromiseMsgOutgoingListener();
  outgoing1.sendMailMessage(
    testFile,
    [],
    [],
    {},
    null,
    null,
    null,
    false,
    "testmessage@local.test",
    listener1
  );
  await listener1.promise;
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user1",
    "First message should have been sent as 'user1'"
  );

  info("Sending as user2");
  const listener2 = new PromiseTestUtils.PromiseMsgOutgoingListener();
  outgoing2.sendMailMessage(
    testFile,
    [],
    [],
    {},
    null,
    null,
    null,
    false,
    "testmessage@local.test",
    listener2
  );
  await listener2.promise;
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user2",
    "Second message should have been sent as 'user2'"
  );

  info("Sending as user1 for a second time.");
  const listener3 = new PromiseTestUtils.PromiseMsgOutgoingListener();
  outgoing1.sendMailMessage(
    testFile,
    [],
    [],
    {},
    null,
    null,
    null,
    false,
    "testmessage@local.test",
    listener3
  );
  await listener3.promise;
  Assert.equal(
    ewsServer.lastAuthedUser,
    "user1",
    "Third message should have been sent as 'user1' again"
  );

  MailServices.outgoingServer.deleteServer(outgoing1);
  MailServices.outgoingServer.deleteServer(outgoing2);
});

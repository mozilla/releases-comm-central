/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let [daemon, server] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Test Pop3Channel can download a partial message correctly.
 */
add_task(async function test_fetchPartialMessage() {
  // Set up a test message.
  daemon.setMessages(["message1.eml"]);

  // Set up the incoming server to fetch headers only.
  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer
    .QueryInterface(Ci.nsILocalMailIncomingServer)
    .createDefaultMailboxes();
  incomingServer.headersOnly = true;

  // Use GetNewMail to fetch the headers.
  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    incomingServer.rootFolder.getChildNamed("Inbox"),
    incomingServer
  );
  await urlListener.promise;

  // Check TOP is correctly sent.
  let transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 0",
  ]);

  let streamListener = new PromiseTestUtils.PromiseStreamListener();
  // A nsIPop3URL instance is needed to construct a Pop3Channel, but we can't
  // create a nsIPop3URL instance in JS directly. A workaround is constructing a
  // mailbox: url with a uidl query, then newChannel will return a Pop3Channel.
  let channel = NetUtil.newChannel({
    uri: `${incomingServer.serverURI}/Inbox?uidl=UIDL1`,
    loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    securityFlags: Ci.nsILoadInfo.SEC_REQUIRE_SAME_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  });
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Check RETR is correctly sent.
  transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1",
    "DELE 1",
  ]);
});

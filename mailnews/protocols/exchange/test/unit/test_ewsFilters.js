/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var ewsServer;
var incomingServer;

add_setup(async () => {
  do_get_profile();

  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.QueryInterface(Ci.IEwsIncomingServer);
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  await syncFolder(incomingServer, incomingServer.rootFolder);
  registerCleanupFunction(() => {
    ewsServer.stop();
  });
});

/**
 * Test that basic filtering is applied to incoming messages.
 */
add_task(async function testBasicFiltering() {
  // Sometimes a connection error occurs after the test has completed.
  // See Bug 1982958.
  // The error is caught down in ews_xpcom (Rust) which attempts to pop up a
  // GUI alert to warn the user. But because this test runs without a window,
  // an assertion triggers. Setting this pref works around it.
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);

  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());
  ewsServer.clearItems();
  ewsServer.maxSyncItems = 4;

  // Load test messages to server, with "TOP-SECRET" in subject of every
  // second one.
  const generator = new MessageGenerator();
  const messages = generator.makeMessages({ count: 20 });
  messages.forEach((msg, i) => {
    if (i % 2 == 0) {
      msg.subject = `${msg.subject} TOP-SECRET`;
    }
  });
  ewsServer.addMessages("inbox", messages);

  const inbox = incomingServer.rootFolder.getChildNamed("Inbox");

  // Add Filter to mark messages with "TOP-SECRET" in the subject as read.
  const filterList = incomingServer.getFilterList(null);
  const filter = filterList.createFilter("ALL");

  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Subject;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  const value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.Subject;
  value.str = "TOP-SECRET";
  searchTerm.value = value;
  filter.appendTerm(searchTerm);

  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MarkRead;
  filter.appendAction(action);

  filter.enabled = true;
  filterList.insertFilterAt(filterList.filterCount, filter);

  incomingServer.setFilterList(filterList);

  // Fetch messages from server.
  const l = new PromiseTestUtils.PromiseUrlListener();
  inbox.getNewMessages(null, l);
  await l.promise;

  // Wait for the local messages to be updated after the server acks.
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) != inbox.getTotalMessages(false),
    "waiting for messages to be marked as read"
  );

  // Check that filter was applied correctly.
  Assert.equal(inbox.getTotalMessages(false), messages.length);
  Assert.equal(
    inbox.getNumUnread(false),
    messages.length / 2,
    "Half the messages should be untouched by filter."
  );
  for (const msg of inbox.msgDatabase.enumerateMessages()) {
    Assert.equal(
      msg.subject.includes("TOP-SECRET"),
      msg.isRead,
      "Only matching messages should be marked read."
    );
  }
});

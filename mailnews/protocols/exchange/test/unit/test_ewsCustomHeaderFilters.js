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

/**
 * Test that custom-header filtering is applied to incoming messages.
 * This checks that the full header block for an incoming message is made
 * available to the filtering code (the filter won't work if only the
 * nsIMsgDBHdr is available).
 *
 * See also
 * comm/mailnews/imap/test/unit/test_filterCustomHeaders.js
 *
 */
add_task(async function testCustomHeaderFiltering() {
  const [ewsServer, incomingServer] = setupBasicEwsTestServer({});

  // Sometimes a connection error occurs after the test has completed.
  // See Bug 1982958.
  // The error is caught down in ews_xpcom (Rust) which attempts to pop up a
  // GUI alert to warn the user. But because this test runs without a window,
  // an assertion triggers. Setting this pref works around it.
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);

  // Prevent downloading messages in the background, to be sure we're not
  // accidentally relying on the full message being in the offline store.
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  ewsServer.clearItems();
  ewsServer.maxSyncItems = 4;

  // Force the folder list to be synced from the server.
  await syncFolder(incomingServer, incomingServer.rootFolder);

  // Create a test filter which matches an arbitrary header.
  const filterList = incomingServer.getFilterList(null);
  const filter = filterList.createFilter("test arbitrary-header-matching");
  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  const value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.OtherHeader;
  value.str = "wibble";
  searchTerm.value = value;
  searchTerm.booleanAnd = false;
  searchTerm.arbitraryHeader = "Made-Up-Header";
  filter.appendTerm(searchTerm);
  filter.enabled = true;

  // create a mark read action
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MarkRead;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  incomingServer.setFilterList(filterList);

  // Load test messages onto the mock server, adding our custom header to
  // half of them.
  const generator = new MessageGenerator();
  const messages = generator.makeMessages({ count: 20 });
  messages.forEach((msg, i) => {
    if (i % 2 == 0) {
      msg.headers["Made-Up-Header"] = "wibble";
    }
  });
  ewsServer.addMessages("inbox", messages);

  const inbox = incomingServer.rootFolder.getChildNamed("Inbox");

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
});

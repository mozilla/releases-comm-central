/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a view containing partial messages is sorted correctly by size.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const [daemon, server] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

add_task(async function testViewSortBySize() {
  const injectAndGetMessages = async (testMessages, headersOnly) => {
    // Inject test messages into POP3 server, and fetch them.
    daemon.setMessages(testMessages);
    const incomingServer = createPop3ServerAndLocalFolders(server.port);
    incomingServer.leaveMessagesOnServer = false;
    incomingServer.headersOnly = headersOnly;
    const urlListener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.pop3.GetNewMail(
      null,
      urlListener,
      localAccountUtils.inboxFolder,
      incomingServer
    );
    await urlListener.promise;
    MailServices.accounts.removeIncomingServer(incomingServer, false);
  };

  const testMessages = [
    "mailformed_subject.eml",
    "mailformed_recipients.eml",
    "message_with_from_line.eml",
    "message2.eml",
  ];
  await injectAndGetMessages(testMessages, false);
  await injectAndGetMessages(testMessages, true);

  // The local inbox now contains each of the four messages twice, both fully
  // and partially downloaded.

  const dbView = Cc[
    "@mozilla.org/messenger/msgdbview;1?type=threaded"
  ].createInstance(Ci.nsIMsgDBView);

  const checkSort = ascending => {
    const num = dbView.numMsgsInView;
    Assert.equal(num, 8);
    const sizes = [];
    for (let i = 0; i < num; i++) {
      const [size] = dbView.cellTextForColumn(i, "sizeCol").split(" ");
      sizes.push(Number(size));
    }
    return sizes.every(
      (value, index, array) =>
        index == 0 ||
        (ascending ? value >= array[index - 1] : value <= array[index - 1])
    );
  };

  dbView.init(null, null, null);
  dbView.open(
    localAccountUtils.inboxFolder,
    Ci.nsMsgViewSortType.bySize,
    Ci.nsMsgViewSortOrder.descending,
    Ci.nsMsgViewFlagsType.kNone
  );
  Assert.ok(checkSort(false));

  dbView.sort(Ci.nsMsgViewSortType.bySize, Ci.nsMsgViewSortOrder.ascending);
  Assert.ok(checkSort(true));

  dbView.sort(Ci.nsMsgViewSortType.bySize, Ci.nsMsgViewSortOrder.descending);
  Assert.ok(checkSort(false));
});

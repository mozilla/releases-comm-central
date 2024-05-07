/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the values of totalCol, unreadCol, and newCol for threads in various views.
 */

const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const injection = new MessageInjection({ mode: "local" });
const generator = new MessageGenerator();
const now = new Date();

Cc["@mozilla.org/msgDBView/msgDBViewService;1"]
  .getService(Ci.nsIMsgDBViewService)
  .initializeDBViewStrings();

add_task(async function testSingleFolderThreadedView() {
  info("Make a folder and add some messages.");

  const folder = await injection.makeEmptyFolder();
  const synMessages = await makeMessages(folder, [
    { count: 10, msgsPerThread: 3 },
  ]);
  let messages = [...folder.messages];

  const dbView = makeView(
    "threaded",
    folder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewFlagsType.kThreadedDisplay
  );

  info("Check that the messages are put in the right threads.");

  const expectedThreads = [
    messages.slice(0, 3),
    messages.slice(3, 6),
    messages.slice(6, 9),
    messages.slice(9, 10),
  ];
  assertThreadContents(dbView, expectedThreads);

  info("Check the cell values for display.");

  const expectedRows = [
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[0][0].subject,
    },
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[1][0].subject,
    },
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[2][0].subject,
    },
    {
      totalCol: "1",
      unreadCol: "1",
      newCol: "1",
      subjectCol: expectedThreads[3][0].subject,
    },
  ];
  assertCellTexts(dbView, expectedRows);

  info("Add a new message.");

  await makeMessages(folder, [{ count: 1, inReplyTo: synMessages[0] }]);
  // Adding a new message to the first thread makes the thread newer than the
  // others, so we have to rearrange.
  // Move thread to end.
  expectedThreads.push(expectedThreads.shift());
  messages = [...folder.messages];
  expectedThreads[3].push(messages.at(-1));
  // Move row to end.
  expectedRows.push(expectedRows.shift());
  expectedRows[3].totalCol = "4";
  expectedRows[3].unreadCol = "4";
  expectedRows[3].newCol = "4";

  assertThreadContents(dbView, expectedThreads);
  assertCellTexts(dbView, expectedRows);

  info("Read a message.");

  expectedThreads[3][3].markRead(true);
  expectedRows[3].unreadCol = "3";
  expectedRows[3].newCol = "3";
  assertCellTexts(dbView, expectedRows);

  info("Remove the new flag from all of the messages.");

  folder.clearNewMessages();
  for (const row of expectedRows) {
    row.newCol = "";
  }
  assertCellTexts(dbView, expectedRows);

  info("Mark all the messages as read.");

  folder.markAllMessagesRead(null);
  for (const row of expectedRows) {
    row.unreadCol = "";
  }
  assertCellTexts(dbView, expectedRows);

  injection.deleteFolder(folder);
});

add_task(async function testGroupedBySortByDate() {
  info("Make a folder and add some messages.");

  const folder = await injection.makeEmptyFolder();
  await makeMessages(folder, [
    // Future
    { count: 1, age: { days: -1 } },
    // Today
    { count: 1, age: { minutes: 3 } },
    { count: 1, age: { minutes: 2 } },
    { count: 1, age: { minutes: 1 } },
    // Yesterday
    { count: 1, age: { days: 1 } },
    { count: 1, age: { days: 1 }, read: true },
    // Last 7 Days
    { count: 2, age: { days: 5 } },
    // Last 14 Days
    { count: 1, age: { days: 13 }, read: true },
    // Older
    { count: 1, read: true },
    { count: 5 },
  ]);
  const messages = [...folder.messages];

  info("Check that the messages are put in the right threads.");

  const dbView = makeView(
    "group",
    folder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewFlagsType.kGroupBySort
  );
  const expectedThreads = [
    messages.slice(9, 15),
    messages.slice(8, 9),
    messages.slice(6, 8),
    messages.slice(4, 6),
    messages.slice(1, 4),
    messages.slice(0, 1),
  ];
  assertThreadContents(dbView, expectedThreads);

  info("Check the cell values for display.");

  const expectedRows = [
    { totalCol: "6", unreadCol: "5", newCol: "5", subjectCol: "Older" },
    { totalCol: "1", unreadCol: "", newCol: "", subjectCol: "Last 14 Days" },
    { totalCol: "2", unreadCol: "2", newCol: "2", subjectCol: "Last 7 Days" },
    { totalCol: "2", unreadCol: "1", newCol: "1", subjectCol: "Yesterday" },
    { totalCol: "3", unreadCol: "3", newCol: "3", subjectCol: "Today" },
    { totalCol: "1", unreadCol: "1", newCol: "1", subjectCol: "Future" },
  ];
  assertCellTexts(dbView, expectedRows);

  info("Read some messages.");

  // Already read, the value must not go to -1.
  expectedThreads[1][0].markRead(true);

  // Will leave one read and one unread.
  expectedThreads[2][0].markRead(true);
  expectedRows[2].unreadCol = "1";
  expectedRows[2].newCol = "1";

  // Last unread message, value should be the empty string, not 0.
  expectedThreads[5][0].markRead(true);
  expectedRows[5].unreadCol = "";
  expectedRows[5].newCol = "";
  assertCellTexts(dbView, expectedRows);

  info("Remove the new flag from all of the messages.");

  folder.clearNewMessages();
  for (const row of expectedRows) {
    row.newCol = "";
  }
  assertCellTexts(dbView, expectedRows);

  info("Add some new messages.");

  await makeMessages(folder, [
    { count: 1, age: { days: -1 } },
    { count: 2, age: { days: 1 } },
    { count: 1 },
  ]);
  expectedRows[0].totalCol = "7";
  expectedRows[0].unreadCol = "6";
  expectedRows[0].newCol = "1";
  expectedRows[3].totalCol = "4";
  expectedRows[3].unreadCol = "3";
  expectedRows[3].newCol = "2";
  expectedRows[5].totalCol = "2";
  expectedRows[5].unreadCol = "1";
  expectedRows[5].newCol = "1";
  assertCellTexts(dbView, expectedRows);

  info("Expand a group.");

  dbView.toggleOpenState(2);
  assertCellTexts(dbView, [
    ...expectedRows.slice(0, 3),
    { subjectCol: expectedThreads[2][0].subject },
    { subjectCol: expectedThreads[2][1].subject },
    ...expectedRows.slice(3),
  ]);

  info("Collapse the group.");

  dbView.toggleOpenState(2);
  assertCellTexts(dbView, expectedRows);

  info("Flip the sorting.");

  dbView.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
  expectedRows.reverse();
  assertCellTexts(dbView, expectedRows);

  dbView.toggleOpenState(1);
  assertCellTexts(dbView, [
    ...expectedRows.slice(0, 2),
    { subjectCol: expectedThreads[4][0].subject },
    { subjectCol: expectedThreads[4][1].subject },
    { subjectCol: expectedThreads[4][2].subject },
    ...expectedRows.slice(2),
  ]);

  injection.deleteFolder(folder);
}).skip(now.getHours() == 0 && now.getMinutes() < 5);
// (This test will fail if it runs too close to the start of the day.)

add_task(async function testGroupedBySortByAuthor() {
  info("Make a folder and add some messages.");

  const authors = generator.makeNamesAndAddresses(5);
  const folder = await injection.makeEmptyFolder();
  // Messages are not created in the same order as the authors, to catch a
  // possible error in the logic.
  await makeMessages(folder, [
    { count: 3, from: authors[0] },
    { count: 2, from: authors[1], read: true },
    { count: 1, from: authors[2] },
    { count: 3, from: authors[4] },
    { count: 1, from: authors[1] },
    { count: 2, from: authors[3] },
  ]);
  const messages = [...folder.messages];

  info("Check that the messages are put in the right threads.");

  const dbView = makeView(
    "group",
    folder,
    Ci.nsMsgViewSortType.byAuthor,
    Ci.nsMsgViewFlagsType.kGroupBySort
  );
  // In each group the newest messages will be on top, i.e. the opposite of the
  // order they were created.
  const expectedThreads = [
    messages.slice(0, 3).toReversed(),
    [...messages.slice(3, 5), messages[9]].toReversed(),
    messages.slice(5, 6).toReversed(),
    messages.slice(10, 12).toReversed(),
    messages.slice(6, 9).toReversed(),
  ];
  assertThreadContents(dbView, expectedThreads);

  info("Check the cell values for display.");

  const expectedRows = [
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: `${authors[0][0]} <${authors[0][1]}>`,
    },
    {
      totalCol: "3",
      unreadCol: "1",
      newCol: "1",
      subjectCol: `${authors[1][0]} <${authors[1][1]}>`,
    },
    {
      totalCol: "1",
      unreadCol: "1",
      newCol: "1",
      subjectCol: `${authors[2][0]} <${authors[2][1]}>`,
    },
    {
      totalCol: "2",
      unreadCol: "2",
      newCol: "2",
      subjectCol: `${authors[3][0]} <${authors[3][1]}>`,
    },
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: `${authors[4][0]} <${authors[4][1]}>`,
    },
  ];
  assertCellTexts(dbView, expectedRows);

  info("Expand a group.");

  dbView.toggleOpenState(3);
  assertCellTexts(dbView, [
    ...expectedRows.slice(0, 4),
    {
      senderCol: `${authors[3][0]} <${authors[3][1]}>`,
      subjectCol: expectedThreads[3][0].subject,
    },
    {
      senderCol: `${authors[3][0]} <${authors[3][1]}>`,
      subjectCol: expectedThreads[3][1].subject,
    },
    ...expectedRows.slice(4),
  ]);

  injection.deleteFolder(folder);
});

add_task(async function testXFThreadedView() {
  info("Make a folder and add some messages.");

  const folder = await injection.makeEmptyFolder();
  const synMessages = await makeMessages(folder, [
    { count: 10, msgsPerThread: 3 },
  ]);
  let messages = [...folder.messages];

  info("Create a virtual folder and open a view for it.");

  const virtualFolder = VirtualFolderHelper.createNewVirtualFolder(
    "vf",
    folder.parent,
    [folder],
    ["ALL"],
    false
  );

  const searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, folder);

  const dbView = makeView(
    "xfvf",
    folder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    virtualFolder
  );
  dbView.searchSession = searchSession;

  const searchNotify = dbView.QueryInterface(Ci.nsIMsgSearchNotify);
  searchNotify.onNewSearch();
  for (const message of messages) {
    searchNotify.onSearchHit(message, message.folder);
  }
  searchNotify.onSearchDone(Cr.NS_OK);

  info("Check that the messages are put in the right threads.");

  const expectedThreads = [
    messages.slice(0, 3),
    messages.slice(3, 6),
    messages.slice(6, 9),
    messages.slice(9, 10),
  ];
  assertThreadContents(dbView, expectedThreads);

  info("Check the cell values for display.");

  const expectedRows = [
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[0][0].subject,
    },
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[1][0].subject,
    },
    {
      totalCol: "3",
      unreadCol: "3",
      newCol: "3",
      subjectCol: expectedThreads[2][0].subject,
    },
    {
      // This thread only has one message, so it's not a thread.
      // The counts don't work but that doesn't matter.
      subjectCol: expectedThreads[3][0].subject,
    },
  ];
  assertCellTexts(dbView, expectedRows);

  info("Add a new message.");

  await makeMessages(folder, [{ count: 1, inReplyTo: synMessages[0] }]);
  // Move thread to end.
  expectedThreads.push(expectedThreads.shift());
  messages = [...folder.messages];
  expectedThreads[3].push(messages.at(-1));
  // Move row to end.
  expectedRows.push(expectedRows.shift());
  expectedRows[3].totalCol = "4";
  expectedRows[3].unreadCol = "4";
  expectedRows[3].newCol = "4";

  assertThreadContents(dbView, expectedThreads);
  assertCellTexts(dbView, expectedRows);

  info("Marking a message as read.");

  expectedThreads[0][2].markRead(true);
  expectedRows[0].unreadCol = "2";
  expectedRows[0].newCol = "2";
  assertCellTexts(dbView, expectedRows);

  info("Remove the new flag from all of the messages.");

  folder.clearNewMessages();
  for (const row of expectedRows) {
    row.newCol = "";
  }
  assertCellTexts(dbView, expectedRows);

  info("Mark all the messages as read.");

  folder.markAllMessagesRead(null);
  for (const row of expectedRows) {
    row.unreadCol = "";
  }
  assertCellTexts(dbView, expectedRows);

  injection.deleteFolder(folder);
});

async function makeMessages(folder, specs) {
  const generatedMessages = [];
  for (const spec of specs) {
    generatedMessages.push(...generator.makeMessages(spec));
  }
  await injection.addSetsToFolders(
    [folder],
    [new SyntheticMessageSet(generatedMessages)]
  );
  return generatedMessages;
}

function makeView(viewType, folder, sortType, flags, virtualFolder) {
  const dbviewContractId = `@mozilla.org/messenger/msgdbview;1?type=${viewType}`;
  const dbView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  dbView.init(null, null, null);
  if (virtualFolder) {
    dbView.viewFolder = virtualFolder;
  }
  dbView.open(folder, sortType, Ci.nsMsgViewSortOrder.ascending, flags);

  return dbView.QueryInterface(Ci.nsITreeView);
}

function assertThreadContents(dbView, expectedThreads) {
  const dummyRowCount =
    dbView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort ? 1 : 0;
  Assert.equal(dbView.rowCount, expectedThreads.length, "thread count");
  for (let t = 0; t < expectedThreads.length; t++) {
    const expectedThread = expectedThreads[t];
    const actualThread = dbView.getThreadContainingIndex(t);

    for (let r = 0; r < expectedThreads[t].length; r++) {
      info(actualThread.getChildHdrAt(r + dummyRowCount).subject);
    }

    Assert.equal(
      actualThread.numChildren,
      expectedThread.length + dummyRowCount,
      "row count"
    );
    for (let r = 0; r < expectedThreads[t].length; r++) {
      Assert.equal(
        actualThread.getChildHdrAt(r + dummyRowCount),
        expectedThread[r],
        `row ${r} message`
      );
    }
  }
}

function assertCellTexts(dbView, expectedRows) {
  Assert.equal(dbView.rowCount, expectedRows.length, "row count");
  for (const [row, expectedRow] of Object.entries(expectedRows)) {
    const columns = Object.keys(expectedRow);
    const expectedValues = Object.values(expectedRow);
    const actualValues = dbView.cellDataForColumns(row, columns, {}, {});
    Assert.deepEqual(actualValues, expectedValues, `row ${row} values`);
  }
}

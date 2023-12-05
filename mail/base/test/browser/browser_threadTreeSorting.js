/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { sortController, threadTree } = about3Pane;
let rootFolder, testFolder, sourceMessageIDs;
const menuHelper = new MenuTestHelper("menu_View");

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.scroll_to_new_message", false);
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("threadTreeSort")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 320 })
      .map(message => message.toMessageString())
  );

  about3Pane.restoreState({
    messagePaneVisible: false,
    folderURI: testFolder.URI,
  });
  await new Promise(resolve => requestAnimationFrame(resolve));

  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  registerCleanupFunction(async () => {
    await ensure_cards_view();
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.setBoolPref("mailnews.scroll_to_new_message", true);
  });
});

add_task(async function () {
  const messagesByDate = [...testFolder.messages];
  const messagesBySubject = messagesByDate
    .slice()
    .sort((m1, m2) => (m1.subject < m2.subject ? -1 : 1));
  const dateHeaderButton = about3Pane.document.getElementById("dateCol");
  const subjectHeaderButton = about3Pane.document.getElementById("subjectCol");

  // Sanity check.

  Assert.equal(
    about3Pane.gViewWrapper.primarySortType,
    Ci.nsMsgViewSortType.byDate,
    "initial sort column should be byDate"
  );
  Assert.equal(
    about3Pane.gViewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "initial sort order should be ascending"
  );
  Assert.ok(
    about3Pane.gViewWrapper.showThreaded,
    "initial mode should be threaded"
  );
  Assert.equal(
    threadTree.view.rowCount,
    320,
    "correct number of rows in the view"
  );
  Assert.equal(
    threadTree.getLastVisibleIndex(),
    319,
    "should be scrolled to the bottom"
  );

  Assert.equal(getCardActualSubject(320 - 1), messagesByDate.at(-1).subject);
  Assert.equal(getCardActualSubject(320 - 2), messagesByDate.at(-2).subject);
  Assert.equal(getCardActualSubject(320 - 3), messagesByDate.at(-3).subject);

  // Switch to horizontal layout and table view so we can interact with the
  // table header and sort rows properly.
  await ensure_table_view();

  // Check sorting with no message selected.

  await clickHeader(dateHeaderButton, "byDate", "descending");
  Assert.equal(
    threadTree.view.rowCount,
    320,
    "correct number of rows in the view"
  );
  Assert.equal(
    threadTree.getFirstVisibleIndex(),
    0,
    "should be scrolled to the top"
  );

  Assert.equal(getActualSubject(0), messagesByDate.at(-1).subject);
  Assert.equal(getActualSubject(1), messagesByDate.at(-2).subject);
  Assert.equal(getActualSubject(2), messagesByDate.at(-3).subject);

  await clickHeader(dateHeaderButton, "byDate", "ascending");
  Assert.equal(
    threadTree.view.rowCount,
    320,
    "correct number of rows in the view"
  );
  Assert.equal(
    threadTree.getLastVisibleIndex(),
    319,
    "should be scrolled to the bottom"
  );

  Assert.equal(getActualSubject(320 - 1), messagesByDate.at(-1).subject);
  Assert.equal(getActualSubject(320 - 2), messagesByDate.at(-2).subject);
  Assert.equal(getActualSubject(320 - 3), messagesByDate.at(-3).subject);

  // Select a message and check the selection remains after sorting.

  const targetMessage = messagesByDate[49];
  info(`selecting message "${targetMessage.subject}"`);
  threadTree.scrollToIndex(49, true);
  await new Promise(resolve => requestAnimationFrame(resolve));
  threadTree.selectedIndex = 49;
  verifySelection([49], [targetMessage.subject]);

  await clickHeader(dateHeaderButton, "byDate", "descending");
  verifySelection([319 - 49], [targetMessage.subject], {
    where: "last",
  });

  await clickHeader(dateHeaderButton, "byDate", "ascending");
  verifySelection([49], [targetMessage.subject], { where: "first" });

  const targetIndexBySubject = messagesBySubject.indexOf(targetMessage);

  // Switch columns.

  await clickHeader(subjectHeaderButton, "bySubject", "ascending");
  verifySelection([targetIndexBySubject], [targetMessage.subject]);

  await clickHeader(subjectHeaderButton, "bySubject", "descending");
  verifySelection([319 - targetIndexBySubject], [targetMessage.subject]);

  await clickHeader(subjectHeaderButton, "bySubject", "ascending");
  verifySelection([targetIndexBySubject], [targetMessage.subject]);

  // Switch back again.

  await clickHeader(dateHeaderButton, "byDate", "ascending");
  verifySelection([49], [targetMessage.subject], { where: "first" });

  // Select multiple messages, two adjacent to each other, one non-adjacent,
  // and check the selection remains after sorting.

  const targetMessages = [
    messagesByDate[80],
    messagesByDate[81],
    messagesByDate[83],
  ];
  info(
    `selecting messages "${targetMessages.map(m => m.subject).join('", "')}"`
  );
  threadTree.scrollToIndex(83, true);
  await new Promise(resolve => requestAnimationFrame(resolve));
  threadTree.selectedIndices = [80, 81, 83];
  verifySelection(
    [80, 81, 83],
    [
      targetMessages[0].subject,
      targetMessages[1].subject,
      targetMessages[2].subject,
    ],
    { currentIndex: 83 }
  );

  await clickHeader(dateHeaderButton, "byDate", "descending");
  verifySelection(
    [319 - 83, 319 - 81, 319 - 80],
    [
      targetMessages[2].subject,
      // Rows for these two messages probably don't exist yet.
      // targetMessages[1].subject,
      // targetMessages[0].subject,
    ],
    { where: "last" }
  );

  await clickHeader(dateHeaderButton, "byDate", "ascending");
  verifySelection(
    [80, 81, 83],
    [
      // Rows for these two messages probably don't exist yet.
      undefined, // targetMessages[0].subject,
      undefined, // targetMessages[1].subject,
      targetMessages[2].subject,
    ],
    { currentIndex: 83, where: "first" }
  );
});

async function clickHeader(header, type, order) {
  info(`sorting ${type} ${order}`);
  const button = header.querySelector("button");

  let scrollEvents = 0;
  const listener = () => scrollEvents++;

  threadTree.addEventListener("scroll", listener);
  EventUtils.synthesizeMouseAtCenter(button, {}, about3Pane);

  // Wait long enough that any more scrolling would trigger more events.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 100));
  threadTree.removeEventListener("scroll", listener);
  Assert.lessOrEqual(scrollEvents, 1, "only one scroll event should fire");

  Assert.equal(
    about3Pane.gViewWrapper.primarySortType,
    Ci.nsMsgViewSortType[type],
    `sort type should be ${type}`
  );
  Assert.equal(
    about3Pane.gViewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder[order],
    `sort order should be ${order}`
  );
  Assert.ok(about3Pane.gViewWrapper.showThreaded, "mode should be threaded");

  Assert.ok(
    button.classList.contains("sorting"),
    "header button should have the sorted class"
  );
  Assert.equal(
    button.classList.contains("ascending"),
    order == "ascending",
    `header button ${
      order == "ascending" ? "should" : "should not"
    } have the ascending class`
  );
  Assert.equal(
    button.classList.contains("descending"),
    order == "descending",
    `header button ${
      order == "descending" ? "should" : "should not"
    } have the descending class`
  );

  Assert.equal(
    threadTree.table.header.querySelectorAll(
      ".sorting, .ascending, .descending"
    ).length,
    1,
    "no other header buttons should have sorting classes"
  );

  if (AppConstants.platform != "macosx") {
    await menuHelper.testItems({
      viewSortMenu: {},
      sortByDateMenuitem: { checked: type == "byDate" },
      sortBySubjectMenuitem: { checked: type == "bySubject" },
      sortAscending: { checked: order == "ascending" },
      sortDescending: { checked: order == "descending" },
      sortThreaded: { checked: true },
      sortUnthreaded: {},
      groupBySort: {},
    });
  }
}

function verifySelection(
  selectedIndices,
  subjects,
  { currentIndex, where } = {}
) {
  if (currentIndex === undefined) {
    currentIndex = selectedIndices[0];
  }

  Assert.deepEqual(
    threadTree.selectedIndices,
    selectedIndices,
    "selectedIndices"
  );
  Assert.equal(threadTree.currentIndex, currentIndex, "currentIndex");
  if (where == "first") {
    Assert.equal(
      threadTree.getFirstVisibleIndex(),
      currentIndex,
      "currentIndex should be first"
    );
  } else {
    Assert.lessOrEqual(
      threadTree.getFirstVisibleIndex(),
      currentIndex,
      "currentIndex should be at or below first"
    );
  }
  if (where == "last") {
    Assert.equal(
      threadTree.getLastVisibleIndex(),
      currentIndex,
      "currentIndex should be last"
    );
  } else {
    Assert.greaterOrEqual(
      threadTree.getLastVisibleIndex(),
      currentIndex,
      "currentIndex should be at or above last"
    );
  }
  for (let i = 0; i < subjects.length; i++) {
    if (subjects[i]) {
      Assert.equal(getActualSubject(selectedIndices[i]), subjects[i]);
    }
  }
}

function getCardActualSubject(index) {
  const row = threadTree.getRowAtIndex(index);
  return row.querySelector(".thread-card-subject-container > .subject")
    .textContent;
}

function getActualSubject(index) {
  const row = threadTree.getRowAtIndex(index);
  return row.querySelector(".subject-line > span").textContent;
}

function getActualSubjects() {
  return Array.from(
    threadTree.table.body.rows,
    row => row.querySelector(".subject-line > span").textContent
  );
}

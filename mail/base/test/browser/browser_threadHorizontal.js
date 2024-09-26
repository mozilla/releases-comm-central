/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { click_through_appmenu } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { threadTree } = about3Pane;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("horizontalScroll")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  const generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );

  about3Pane.displayFolder(testFolder.URI);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mail.threadpane.table.horizontal_scroll");
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messenger.xhtml"
    );
    about3Pane.folderTree.focus();
  });
});

add_task(async function testHorizontalScroll() {
  const displayContext = about3Pane.document.getElementById(
    "threadPaneDisplayContext"
  );
  const displayButton = about3Pane.document.getElementById(
    "threadPaneDisplayButton"
  );
  const shownPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, about3Pane);
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popuphidden"
  );
  displayContext.activateItem(
    displayContext.querySelector("#threadPaneTableView")
  );
  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
  EventUtils.synthesizeKey("KEY_Escape", {});
  await hiddenPromise;

  const threadPane = about3Pane.document.getElementById("threadPane");

  Assert.equal(
    threadPane.getBoundingClientRect().width,
    threadTree.table.getBoundingClientRect().width,
    "The tree table and the parent container should have the same width"
  );

  Assert.ok(
    about3Pane.document.getElementById("dateCol").dataset.resizable == "false",
    "The last column shouldn't be resizable"
  );
  Assert.ok(
    about3Pane.document.getElementById("dateColSplitter").isDisabled,
    "The last column's splitter should be disabled"
  );

  Services.prefs.setBoolPref("mail.threadpane.table.horizontal_scroll", true);

  // Simulate the resize of some columns by hardcoding a width value so we can
  // force a situation in which the user wants columns to be wider than the
  // available space offered by the threadPane.
  for (const col of ["subjectCol", "correspondentCol", "dateCol"]) {
    const element = about3Pane.document.getElementById(col);
    element.style = "";
    element.width = "400px";
  }

  await BrowserTestUtils.waitForCondition(
    () =>
      threadTree.table.getBoundingClientRect().width >
      threadPane.getBoundingClientRect().width,
    "Waiting for the tree table to grow past its parent"
  );

  Assert.greater(
    threadTree.table.getBoundingClientRect().width,
    threadPane.getBoundingClientRect().width,
    "The tree table should grow past its parent width"
  );

  Assert.ok(
    about3Pane.document.getElementById("dateCol").dataset.resizable == "true",
    "The last column should be resizable"
  );
  Assert.ok(
    !about3Pane.document.getElementById("dateColSplitter").isDisabled,
    "The last column's splitter shouldn't be disabled"
  );

  Services.prefs.setBoolPref("mail.threadpane.table.horizontal_scroll", false);

  await BrowserTestUtils.waitForCondition(
    () =>
      threadTree.table.getBoundingClientRect().width ==
      threadPane.getBoundingClientRect().width,
    "Waiting for the tree table to shrink within the boundaries of its parent"
  );

  Assert.equal(
    threadPane.getBoundingClientRect().width,
    threadTree.table.getBoundingClientRect().width,
    "The tree table and the parent container should have the same width"
  );

  about3Pane.folderTree.focus();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that after enabling or disabling Grouped-By-Sort in a single- or
 * multi-folder virtual view, the view flags are persisted correctly. As long
 * as the front end doesn't simply set `gViewWrapper.showGroupedBySort`, this
 * test is needed in addition to
 * mail/base/test/unit/test_viewWrapper_virtualFolder.js.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const threadTree = about3Pane.threadTree;
const generator = new MessageGenerator();
let rootFolder, virtualFolderA, virtualFolderAB;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  const folderA = rootFolder
    .createLocalSubfolder("groupedBySortPersistenceA")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderA.addMessageBatch(
    generator
      .makeMessages({ count: 15 })
      .map(message => message.toMessageString())
  );

  const folderB = rootFolder
    .createLocalSubfolder("groupedBySortPersistenceB")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB.addMessageBatch(
    generator
      .makeMessages({ count: 15 })
      .map(message => message.toMessageString())
  );

  virtualFolderA = rootFolder.createLocalSubfolder(
    "groupedBySortPersistenceSingle"
  );
  virtualFolderA.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const folderInfoA = virtualFolderA.msgDatabase.dBFolderInfo;
  // To make sure it isn't just the backing real folder that's displayed for
  // some reason, really search for something.
  folderInfoA.setCharProperty("searchStr", "AND (date,is after,31-Dec-1999)");
  folderInfoA.setCharProperty("searchFolderUri", folderA.URI);

  virtualFolderAB = rootFolder.createLocalSubfolder(
    "groupedBySortPersistenceMulti"
  );
  virtualFolderAB.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const folderInfoAB = virtualFolderAB.msgDatabase.dBFolderInfo;
  folderInfoAB.setCharProperty("searchStr", "AND (date,is after,31-Dec-1999)");
  folderInfoAB.setCharProperty(
    "searchFolderUri",
    `${folderA.URI}|${folderB.URI}`
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

const subTest = async folder => {
  // Open the folder and enable grouped by sort.
  about3Pane.displayFolder(folder);
  about3Pane.sortController.sortThreadPane("correspondentCol");
  about3Pane.sortController.sortAscending();
  about3Pane.sortController.groupBySort();
  await BrowserTestUtils.waitForCondition(
    () => threadTree.dataset.showGroupedBySort == "true",
    "The tree view should be grouped by sort"
  );

  // Switch to another folder, then back again. The folder should still be
  // grouped by sort.
  about3Pane.displayFolder(rootFolder);
  about3Pane.displayFolder(folder);
  Assert.equal(
    about3Pane.gViewWrapper.primarySortType,
    Ci.nsMsgViewSortType.byCorrespondent,
    "The folder should still be sorted by Correspondent"
  );
  Assert.equal(
    about3Pane.gViewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "The folder should still be sorted ascending"
  );
  Assert.equal(
    about3Pane.gViewWrapper.showGroupedBySort,
    true,
    "The tree view should still be grouped by sort"
  );

  // Disable grouped by sort.
  about3Pane.sortController.sortThreadPane("dateCol");
  await BrowserTestUtils.waitForCondition(
    () => threadTree.dataset.showGroupedBySort == "false",
    "The tree view should not be grouped by sort anymore"
  );

  // Switch to another folder and back again. Grouped by sort should remain
  // disabled.
  about3Pane.displayFolder(rootFolder);
  about3Pane.displayFolder(folder);
  Assert.equal(
    about3Pane.gViewWrapper.primarySortType,
    Ci.nsMsgViewSortType.byDate,
    "The folder should now be sorted by Date"
  );
  Assert.equal(
    about3Pane.gViewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "The folder should still be sorted ascending"
  );
  Assert.equal(
    about3Pane.gViewWrapper.showUnthreaded,
    true,
    "The tree view should now be unthreaded"
  );
};

/** Test a virtual folder with a single backing folder. */
add_task(async function testSingleVirtual() {
  await subTest(virtualFolderA);
});

/** Test a virtual folder with multiple backing folders. */
add_task(async function testXFVirtual() {
  await subTest(virtualFolderAB);
}).skip(
  // Permanent failure on CI, bug 1911891.
  AppConstants.platform == "win" &&
    AppConstants.DEBUG &&
    !Services.appinfo.is64Bit
);

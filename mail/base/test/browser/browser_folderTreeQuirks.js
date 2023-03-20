/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);

let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let { displayFolder, folderPane, folderTree, threadTree } = about3Pane;
let rootFolder,
  folderA,
  folderAMessages,
  folderB,
  folderBMessages,
  folderC,
  folderCMessages;

add_setup(async function() {
  let generator = new MessageGenerator();
  let messageInjection = new MessageInjection(
    {
      mode: "local",
    },
    generator
  );

  let account = MailServices.accounts.accounts[0];
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("folder a", null);
  folderA = rootFolder
    .getChildNamed("folder a")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderA.createSubfolder("folder b", null);
  folderB = folderA
    .getChildNamed("folder b")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderB.createSubfolder("folder c", null);
  folderC = folderB
    .getChildNamed("folder c")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  messageInjection.addSetsToFolders(
    [folderA, folderB, folderC],
    [
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
    ]
  );

  folderAMessages = [...folderA.messages];
  folderBMessages = [...folderB.messages];
  folderCMessages = [...folderC.messages];

  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  about3Pane.paneLayout.messagePaneVisible = false;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
    folderPane.activeModes = ["all"];
  });
});

add_task(async function testFavoriteFolders() {
  folderPane.activeModes = ["all", "favorite"];
  checkModeListItems("favorite", []);

  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", [rootFolder, folderA]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", []);

  folderB.setFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", [rootFolder, folderB]);

  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", []);

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", [rootFolder, folderA, folderC]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", [rootFolder, folderC]);

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  checkModeListItems("favorite", []);
});

add_task(async function testUnreadFolders() {
  folderPane.activeModes = ["all", "unread"];
  checkModeListItems("unread", []);

  folderAMessages[0].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA]);

  folderAMessages[1].markRead(false);
  folderAMessages[2].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA]);

  window.MsgMarkAllRead([folderA]);
  await new Promise(resolve => setTimeout(resolve));
  checkModeListItems("unread", []);

  folderAMessages[0].markRead(false);
  folderBMessages[0].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB]);

  folderCMessages[0].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderBMessages[0].markRead(true);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderAMessages[0].markRead(true);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[0].markRead(true);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", []);

  folderCMessages[0].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[1].markRead(false);
  folderCMessages[2].markRead(false);
  await new Promise(resolve => setTimeout(resolve));
  expandAll("unread");
  checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  window.MsgMarkAllRead([folderC]);
  await new Promise(resolve => setTimeout(resolve));
  checkModeListItems("unread", []);
});

/**
 * The creation of a virtual folder involves two "folderAdded" notifications.
 * Check that only one entry in the folder tree is created.
 */
add_task(async function testSearchFolderAddedOnlyOnce() {
  let context = about3Pane.document.getElementById("folderPaneContext");
  let searchMessagesItem = about3Pane.document.getElementById(
    "folderPaneContext-searchMessages"
  );
  let removeItem = about3Pane.document.getElementById(
    "folderPaneContext-remove"
  );

  // Start searching for messages.

  let shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(rootFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  let searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  context.activateItem(searchMessagesItem);
  let searchWindow = await searchWindowPromise;

  EventUtils.synthesizeMouseAtCenter(
    searchWindow.document.getElementById("searchVal0"),
    {},
    searchWindow
  );
  EventUtils.sendString("hovercraft", searchWindow);

  // Create a virtual folder for the search.

  let vfWindowPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(vfWindow) {
        EventUtils.synthesizeMouseAtCenter(
          vfWindow.document.getElementById("name"),
          {},
          vfWindow
        );
        EventUtils.sendString("virtual folder", vfWindow);
        EventUtils.synthesizeMouseAtCenter(
          vfWindow.document.querySelector("dialog").getButton("accept"),
          {},
          vfWindow
        );
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    searchWindow.document.getElementById("saveAsVFButton"),
    {},
    searchWindow
  );
  await vfWindowPromise;

  await BrowserTestUtils.closeWindow(searchWindow);

  // Find the folder and the row for it in the tree.

  let virtualFolder = rootFolder.getChildNamed("virtual folder");
  let row = await TestUtils.waitForCondition(() =>
    folderPane.getRowForFolder(virtualFolder)
  );

  // Check it exists only once.

  checkModeListItems("all", [
    rootFolder,
    rootFolder.getChildNamed("Inbox"),
    rootFolder.getChildNamed("Trash"),
    virtualFolder,
    rootFolder.getChildNamed("Outbox"),
    folderA,
    folderB,
    folderC,
  ]);

  // Delete the virtual folder.

  shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  let dialogPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
  context.activateItem(removeItem);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  // Check it went away.

  checkModeListItems("all", [
    rootFolder,
    rootFolder.getChildNamed("Inbox"),
    rootFolder.getChildNamed("Trash"),
    rootFolder.getChildNamed("Outbox"),
    folderA,
    folderB,
    folderC,
  ]);
});

function checkModeListItems(modeName, folders) {
  Assert.deepEqual(
    Array.from(
      folderPane._modes[modeName].containerList.querySelectorAll("li"),
      folderTreeRow => folderTreeRow.uri
    ),
    folders.map(folder => folder.URI)
  );
}

function expandAll(modeName) {
  for (let folderTreeRow of folderPane._modes[
    modeName
  ].containerList.querySelectorAll("li")) {
    folderTree.expandRow(folderTreeRow);
  }
}

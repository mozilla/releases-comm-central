/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that subfolders added to searched folders are also searched.
 */

const { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);

add_task(function () {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  // Listen to folder events for debugging purposes.

  MailServices.mailSession.AddFolderListener(
    {
      QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
      onFolderAdded(parentFolder, childFolder) {
        console.log(
          `onFolderAdded: ${
            childFolder?.URI
          } (flags: ${childFolder.flags.toString(16)}) added to ${
            parentFolder?.URI
          }`
        );
      },
      onMessageAdded(parentFolder, msg) {},
      onFolderRemoved(parentFolder, childFolder) {
        console.log(
          `onFolderRemoved: ${
            childFolder?.URI
          } (flags: ${childFolder.flags.toString(16)}) removed from ${
            parentFolder?.URI
          }`
        );
      },
      onMessageRemoved(parentFolder, msg) {},
      onFolderPropertyChanged(folder, property, oldValue, newValue) {},
      onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
        if (property == "FolderFlag") {
          console.log(
            `onFolderIntPropertyChanged: ${
              folder.URI
            } changed flags from ${oldValue.toString(
              16
            )} to ${newValue.toString(16)}`
          );
        }
      },
      onFolderBoolPropertyChanged(folder, property, oldValue, newValue) {},
      onFolderUnicharPropertyChanged(folder, property, oldValue, newValue) {},
      onFolderPropertyFlagChanged(folder, property, oldFlag, newFlag) {},
      onFolderEvent(folder, event) {},
    },
    Ci.nsIFolderListener.all
  );

  // Test each of the folder types.

  subtest(rootFolder, "Inbox");
  subtest(rootFolder, "Drafts");
  subtest(rootFolder, "Templates");
  subtest(rootFolder, "SentMail");
  subtest(rootFolder, "Archive");
  subtest(rootFolder, "Junk");
  subtest(rootFolder, "Trash");
});

function subtest(rootFolder, flag) {
  // Create a virtual folder. This is very similar to the code in about3Pane.js.

  let virtualFolder = rootFolder.createLocalSubfolder(`virtual${flag}`);
  virtualFolder.flags |=
    Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags[flag];

  let msgDatabase = virtualFolder.msgDatabase;
  let folderInfo = msgDatabase.dBFolderInfo;

  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setUint32Property("searchFolderFlag", Ci.nsMsgFolderFlags[flag]);
  folderInfo.setBooleanProperty("searchOnline", true);
  msgDatabase.summaryValid = true;
  msgDatabase.close(true);

  function checkVirtualFolder(searchFolders, message) {
    let wrappedVirtualFolder =
      VirtualFolderHelper.wrapVirtualFolder(virtualFolder);
    Assert.deepEqual(
      wrappedVirtualFolder.searchFolderURIs.split("|").filter(Boolean).sort(),
      searchFolders.map(f => f.URI).sort(),
      message
    );
    Assert.deepEqual(
      wrappedVirtualFolder.searchFolders,
      searchFolders,
      message
    );
  }

  rootFolder.notifyFolderAdded(virtualFolder);
  checkVirtualFolder([], "new virtual folder should have no search folders");

  // Create a disconnected folder with some descendants, add the flag and then
  // add it to the parent. The folder and descendants should all be added to
  // the virtual folder.

  let parent = MailServices.folderLookup.getOrCreateFolderForURL(
    `${rootFolder.URI}/parent${flag}`
  );
  parent.setFlag(Ci.nsMsgFolderFlags[flag]);
  let child = MailServices.folderLookup.getOrCreateFolderForURL(
    `${rootFolder.URI}/parent${flag}/child`
  );
  parent.addSubfolder(child.name);
  let grandchild = MailServices.folderLookup.getOrCreateFolderForURL(
    `${rootFolder.URI}/parent${flag}/child/grandchild`
  );
  child.addSubfolder(grandchild.name);

  rootFolder.addSubfolder(parent.name);
  rootFolder.notifyFolderAdded(parent);
  parent.notifyFolderAdded(child);
  child.notifyFolderAdded(grandchild);

  checkVirtualFolder(
    [parent, child, grandchild],
    "added folder and descendants should be added to the virtual folder"
  );

  // Create a subfolder of a real folder with some descendants, then set the
  // flag. The folder and descendants should all be added to the virtual folder.

  let more = rootFolder.createLocalSubfolder(`more${flag}`);
  more.QueryInterface(Ci.nsIMsgLocalMailFolder);
  let evenMore = more.createLocalSubfolder("even more");
  evenMore.QueryInterface(Ci.nsIMsgLocalMailFolder);
  let yetMore = evenMore.createLocalSubfolder("yet more");
  more.setFlag(Ci.nsMsgFolderFlags[flag]);

  checkVirtualFolder(
    [more, evenMore, yetMore, parent, child, grandchild],
    "folder with changed flag and descendants should be added to the virtual folder"
  );

  // Now reverse the additions.

  rootFolder.propagateDelete(parent, false);
  checkVirtualFolder(
    [more, evenMore, yetMore],
    "deleted folder and descendants should be removed from the virtual folder"
  );

  if (flag != "Inbox") {
    // Clearing the inbox flag from a folder that has it throws an assertion.
    more.clearFlag(Ci.nsMsgFolderFlags[flag]);
    checkVirtualFolder(
      [],
      "folder with changed flag and descendants should be removed from the virtual folder"
    );

    Assert.equal(
      virtualFolder.parent,
      rootFolder,
      "smart virtual folder should NOT be removed with last search folder"
    );
  }
}

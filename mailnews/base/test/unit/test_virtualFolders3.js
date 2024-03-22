/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that subfolders added to searched folders are also searched.
 */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

let rootFolder;

add_setup(function () {
  const account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder;
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
      onMessageAdded() {},
      onFolderRemoved(parentFolder, childFolder) {
        console.log(
          `onFolderRemoved: ${
            childFolder?.URI
          } (flags: ${childFolder.flags.toString(16)}) removed from ${
            parentFolder?.URI
          }`
        );
      },
      onMessageRemoved() {},
      onFolderPropertyChanged() {},
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
      onFolderBoolPropertyChanged() {},
      onFolderUnicharPropertyChanged() {},
      onFolderPropertyFlagChanged() {},
      onFolderEvent() {},
    },
    Ci.nsIFolderListener.all
  );
});

// Test each of the folder types.
add_task(function testInbox() {
  subtest("Inbox");
});
add_task(function testDrafts() {
  subtest("Drafts");
});
add_task(function testTemplates() {
  subtest("Templates");
});
add_task(function testSentMail() {
  subtest("SentMail");
});
add_task(function testArchive() {
  subtest("Archive");
});
add_task(function testJunk() {
  subtest("Junk");
});
add_task(function testTrash() {
  subtest("Trash");
});

function subtest(flag) {
  // Create a virtual folder. This is very similar to the code in about3Pane.js.

  const virtualFolder = rootFolder.createLocalSubfolder(`virtual${flag}`);
  virtualFolder.flags |=
    Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags[flag];

  const msgDatabase = virtualFolder.msgDatabase;
  const folderInfo = msgDatabase.dBFolderInfo;

  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setUint32Property("searchFolderFlag", Ci.nsMsgFolderFlags[flag]);
  folderInfo.setBooleanProperty("searchOnline", true);
  msgDatabase.summaryValid = true;
  msgDatabase.close(true);

  function checkVirtualFolder(searchFolders, message) {
    const wrappedVirtualFolder =
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

  const parent = MailServices.folderLookup.getOrCreateFolderForURL(
    `${rootFolder.URI}/parent${flag}`
  );
  parent.setFlag(Ci.nsMsgFolderFlags[flag]);
  const child = MailServices.folderLookup.getOrCreateFolderForURL(
    `${rootFolder.URI}/parent${flag}/child`
  );
  parent.addSubfolder(child.name);
  const grandchild = MailServices.folderLookup.getOrCreateFolderForURL(
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

  const more = rootFolder.createLocalSubfolder(`more${flag}`);
  more.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const evenMore = more.createLocalSubfolder("even more");
  evenMore.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const yetMore = evenMore.createLocalSubfolder("yet more");
  more.setFlag(Ci.nsMsgFolderFlags[flag]);

  checkVirtualFolder(
    [more, evenMore, yetMore, parent, child, grandchild],
    "folder with changed flag and descendants should be added to the virtual folder"
  );

  // Test what happens if a folder of one type is not added to a parent in the
  // virtual folder of another type. This should really only matter for inboxes
  // containing other types of folders, which happens in some configurations.
  // Other combinations shouldn't really exist, but let's test them anyway.

  if (!["SentMail", "Archive"].includes(flag)) {
    for (const otherFlag of [
      "Inbox",
      "Drafts",
      "Templates",
      "SentMail",
      "Archive",
      "Junk",
      "Trash",
    ]) {
      if (otherFlag == flag) {
        continue;
      }
      const otherFlagChild = MailServices.folderLookup.getOrCreateFolderForURL(
        `${rootFolder.URI}/parent${flag}/other${otherFlag}Child`
      );
      otherFlagChild.setFlag(Ci.nsMsgFolderFlags[otherFlag]);
      parent.addSubfolder(otherFlagChild.name);
      parent.notifyFolderAdded(otherFlagChild);

      if (flag == "Trash") {
        checkVirtualFolder(
          [more, evenMore, yetMore, parent, child, grandchild, otherFlagChild],
          `folder with ${otherFlag} flag should be added to the virtual ${flag} folder`
        );
      } else {
        checkVirtualFolder(
          [more, evenMore, yetMore, parent, child, grandchild],
          `folder with ${otherFlag} flag should not be added to the virtual ${flag} folder`
        );
      }

      parent.propagateDelete(otherFlagChild, false);
    }
  }

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

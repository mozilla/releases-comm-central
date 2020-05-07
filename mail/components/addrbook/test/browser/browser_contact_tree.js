/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

function createAddressBook(name) {
  let dirPrefId = MailServices.ab.newAddressBook(name, "", 101);
  return MailServices.ab.getDirectoryFromId(dirPrefId);
}

function createContact(firstName, lastName) {
  let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = `${firstName} ${lastName}`;
  contact.firstName = firstName;
  contact.lastName = lastName;
  contact.primaryEmail = `${firstName}.${lastName}@invalid`;
  return contact;
}

function createMailingList(name) {
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = name;
  return list;
}

var observer = {
  topics: [
    "addrbook-directory-created",
    "addrbook-directory-updated",
    "addrbook-directory-deleted",
    "addrbook-contact-created",
    "addrbook-contact-updated",
    "addrbook-contact-deleted",
    "addrbook-list-created",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ],
  setUp() {
    for (let topic of this.topics) {
      Services.obs.addObserver(observer, topic);
    }
  },
  cleanUp() {
    for (let topic of this.topics) {
      Services.obs.removeObserver(observer, topic);
    }
  },
  promiseNotification() {
    return new Promise(resolve => {
      this.notificationPromise = resolve;
    });
  },
  resolveNotificationPromise() {
    if (this.notificationPromise) {
      let resolve = this.notificationPromise;
      delete this.notificationPromise;
      resolve();
    }
  },

  notifications: [],
  observe(subject, topic, data) {
    info([topic, subject, data]);
    this.notifications.push([topic, subject, data]);
    this.resolveNotificationPromise();
  },
};

add_task(async () => {
  function openRootDirectory() {
    mailTestUtils.treeClick(EventUtils, abWindow, abDirTree, 0, 0, {});
  }

  function openDirectory(directory) {
    for (let i = 0; i < abDirTree.view.rowCount; i++) {
      abDirTree.changeOpenState(i, true);
    }

    let row = abWindow.gDirectoryTreeView.getIndexForId(directory.URI);
    mailTestUtils.treeClick(EventUtils, abWindow, abDirTree, row, 0, {});
  }

  function deleteRowWithPrompt(row) {
    let promptPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
    mailTestUtils.treeClick(EventUtils, abWindow, abContactTree, row, 0, {});
    EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
    return promptPromise;
  }

  function checkRows(...expectedCards) {
    Assert.equal(
      abWindow.gAbView.rowCount,
      expectedCards.length,
      "rowCount correct"
    );
    for (let i = 0; i < expectedCards.length; i++) {
      if (expectedCards[i].isMailList) {
        Assert.equal(
          abWindow.gAbView.getCardFromRow(i).displayName,
          expectedCards[i].dirName
        );
      } else {
        Assert.equal(
          abWindow.gAbView.getCardFromRow(i).displayName,
          expectedCards[i].displayName
        );
      }
    }
  }

  let bookA = createAddressBook("book A");
  let contactA1 = bookA.addCard(createContact("contact", "A1"));
  let bookB = createAddressBook("book B");
  let contactB1 = bookB.addCard(createContact("contact", "B1"));

  let abWindow = await openAddressBookWindow();
  let abDirTree = abWindow.GetDirTree();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  observer.setUp();

  openRootDirectory();
  checkRows(contactA1, contactB1);

  // While in bookA, add a contact and list. Check that they show up.
  openDirectory(bookA);
  checkRows(contactA1);
  let contactA2 = bookA.addCard(createContact("contact", "A2")); // Add A2.
  checkRows(contactA1, contactA2);
  let listC = bookA.addMailList(createMailingList("list C")); // Add C.
  // Adding a mailing list changes the view. Go back to where we were.
  openDirectory(bookA);
  checkRows(contactA1, contactA2, listC);
  listC.addCard(contactA1);
  checkRows(contactA1, contactA2, listC);

  openRootDirectory();
  checkRows(contactA1, contactA2, contactB1, listC);

  // While in listC, add a member and remove a member. Check that they show up
  // or disappear as appropriate.
  openDirectory(listC);
  checkRows(contactA1);
  listC.addCard(contactA2);
  checkRows(contactA1, contactA2);
  await deleteRowWithPrompt(0);
  checkRows(contactA2);

  openRootDirectory();
  checkRows(contactA1, contactA2, contactB1, listC);

  // While in bookA, delete a contact. Check it disappears.
  openDirectory(bookA);
  checkRows(contactA1, contactA2, listC);
  await deleteRowWithPrompt(0); // Delete A1.
  checkRows(contactA2, listC);
  // Now do some things in an unrelated book. Check nothing changes here.
  let contactB2 = bookB.addCard(createContact("contact", "B2")); // Add B2.
  checkRows(contactA2, listC);
  let listD = bookB.addMailList(createMailingList("list D")); // Add D.
  // Adding a mailing list changes the view. Go back to where we were.
  openDirectory(bookA);
  checkRows(contactA2, listC);
  listD.addCard(contactB1);
  checkRows(contactA2, listC);

  openRootDirectory();
  checkRows(contactA2, contactB1, contactB2, listC, listD);

  // While in listC, do some things in an unrelated list. Check nothing
  // changes here.
  openDirectory(listC);
  checkRows(contactA2);
  listD.addCard(contactB2);
  checkRows(contactA2);
  listD.deleteCards([contactB1]);
  checkRows(contactA2);
  bookB.deleteCards([contactB1]);
  checkRows(contactA2);

  openRootDirectory();
  checkRows(contactA2, contactB2, listC, listD);

  // While in bookA, do some things in an unrelated book. Check nothing
  // changes here.
  openDirectory(bookA);
  checkRows(contactA2, listC);
  bookB.deleteDirectory(listD); // Delete D.
  // Removing a mailing list changes the view. Go back to where we were.
  openDirectory(bookA);
  checkRows(contactA2, listC);
  await deleteRowWithPrompt(1); // Delete C.
  checkRows(contactA2);

  // While in "All Address Books", make some changes and check that things
  // appear or disappear as appropriate.
  openRootDirectory();
  checkRows(contactA2, contactB2);
  let listE = bookB.addMailList(createMailingList("list E")); // Add E.
  // Adding a mailing list changes the view. Go back to where we were.
  openRootDirectory();
  checkRows(contactA2, contactB2, listE);
  listE.addCard(contactB2);
  checkRows(contactA2, contactB2, listE);
  listE.deleteCards([contactB2]);
  checkRows(contactA2, contactB2, listE);
  bookB.deleteDirectory(listE); // Delete E.
  // Removing a mailing list changes the view. Go back to where we were.
  openRootDirectory();
  checkRows(contactA2, contactB2);
  await deleteRowWithPrompt(1);
  checkRows(contactA2);
  bookA.deleteCards([contactA2]);
  checkRows();

  abWindow.close();

  let deletePromise = observer.promiseNotification();
  MailServices.ab.deleteAddressBook(bookA.URI);
  await deletePromise;
  deletePromise = observer.promiseNotification();
  MailServices.ab.deleteAddressBook(bookB.URI);
  await deletePromise;

  observer.cleanUp();
});

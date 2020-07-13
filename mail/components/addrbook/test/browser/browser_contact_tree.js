/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

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
  function deleteRowWithPrompt(row) {
    let promptPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
    mailTestUtils.treeClick(EventUtils, abWindow, abContactTree, row, 0, {});
    EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
    return promptPromise;
  }

  let bookA = createAddressBook("book A");
  let contactA1 = bookA.addCard(createContact("contact", "A1"));
  let bookB = createAddressBook("book B");
  let contactB1 = bookB.addCard(createContact("contact", "B1"));

  let abWindow = await openAddressBookWindow();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  observer.setUp();

  openRootDirectory();
  checkCardsListed(contactA1, contactB1);

  // While in bookA, add a contact and list. Check that they show up.
  openDirectory(bookA);
  checkCardsListed(contactA1);
  let contactA2 = bookA.addCard(createContact("contact", "A2")); // Add A2.
  checkCardsListed(contactA1, contactA2);
  let listC = bookA.addMailList(createMailingList("list C")); // Add C.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA1, contactA2, listC);
  listC.addCard(contactA1);
  checkCardsListed(contactA1, contactA2, listC);

  openRootDirectory();
  checkCardsListed(contactA1, contactA2, contactB1, listC);

  // While in listC, add a member and remove a member. Check that they show up
  // or disappear as appropriate.
  openDirectory(listC);
  checkCardsListed(contactA1);
  listC.addCard(contactA2);
  checkCardsListed(contactA1, contactA2);
  await deleteRowWithPrompt(0);
  checkCardsListed(contactA2);

  openRootDirectory();
  checkCardsListed(contactA1, contactA2, contactB1, listC);

  // While in bookA, delete a contact. Check it disappears.
  openDirectory(bookA);
  checkCardsListed(contactA1, contactA2, listC);
  await deleteRowWithPrompt(0); // Delete A1.
  checkCardsListed(contactA2, listC);
  // Now do some things in an unrelated book. Check nothing changes here.
  let contactB2 = bookB.addCard(createContact("contact", "B2")); // Add B2.
  checkCardsListed(contactA2, listC);
  let listD = bookB.addMailList(createMailingList("list D")); // Add D.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA2, listC);
  listD.addCard(contactB1);
  checkCardsListed(contactA2, listC);

  openRootDirectory();
  checkCardsListed(contactA2, contactB1, contactB2, listC, listD);

  // While in listC, do some things in an unrelated list. Check nothing
  // changes here.
  openDirectory(listC);
  checkCardsListed(contactA2);
  listD.addCard(contactB2);
  checkCardsListed(contactA2);
  listD.deleteCards([contactB1]);
  checkCardsListed(contactA2);
  bookB.deleteCards([contactB1]);
  checkCardsListed(contactA2);

  openRootDirectory();
  checkCardsListed(contactA2, contactB2, listC, listD);

  // While in bookA, do some things in an unrelated book. Check nothing
  // changes here.
  openDirectory(bookA);
  checkCardsListed(contactA2, listC);
  bookB.deleteDirectory(listD); // Delete D.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA2, listC);
  await deleteRowWithPrompt(1); // Delete C.
  checkCardsListed(contactA2);

  // While in "All Address Books", make some changes and check that things
  // appear or disappear as appropriate.
  openRootDirectory();
  checkCardsListed(contactA2, contactB2);
  let listE = bookB.addMailList(createMailingList("list E")); // Add E.
  checkDirectoryDisplayed(null);
  checkCardsListed(contactA2, contactB2, listE);
  listE.addCard(contactB2);
  checkCardsListed(contactA2, contactB2, listE);
  listE.deleteCards([contactB2]);
  checkCardsListed(contactA2, contactB2, listE);
  bookB.deleteDirectory(listE); // Delete E.
  checkDirectoryDisplayed(null);
  checkCardsListed(contactA2, contactB2);
  await deleteRowWithPrompt(1);
  checkCardsListed(contactA2);
  bookA.deleteCards([contactA2]);
  checkCardsListed();

  abWindow.close();

  let deletePromise = observer.promiseNotification();
  MailServices.ab.deleteAddressBook(bookA.URI);
  await deletePromise;
  deletePromise = observer.promiseNotification();
  MailServices.ab.deleteAddressBook(bookB.URI);
  await deletePromise;

  observer.cleanUp();
});

add_task(async () => {
  let abWindow = await openAddressBookWindow();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  Assert.equal(abContactTree.columns[0].element.id, "GeneratedName");
  Assert.equal(
    abContactTree.columns[0].element.getAttribute("sortDirection"),
    "ascending"
  );
  for (let i = 1; i < abContactTree.columns.length; i++) {
    Assert.equal(
      abContactTree.columns[i].element.getAttribute("sortDirection"),
      ""
    );
  }

  let bookA = createAddressBook("book A");
  openDirectory(bookA);
  checkCardsListed();
  let contactA2 = bookA.addCard(createContact("contact", "A2"));
  checkCardsListed(contactA2);
  let contactA1 = bookA.addCard(createContact("contact", "A1")); // Add first.
  checkCardsListed(contactA1, contactA2);
  let contactA5 = bookA.addCard(createContact("contact", "A5")); // Add last.
  checkCardsListed(contactA1, contactA2, contactA5);
  let contactA3 = bookA.addCard(createContact("contact", "A3")); // Add in the middle.
  checkCardsListed(contactA1, contactA2, contactA3, contactA5);

  // Flip sort direction.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  Assert.equal(
    abContactTree.columns[0].element.getAttribute("sortDirection"),
    "descending"
  );
  checkCardsListed(contactA5, contactA3, contactA2, contactA1);
  let contactA4 = bookA.addCard(createContact("contact", "A4")); // Add in the middle.
  checkCardsListed(contactA5, contactA4, contactA3, contactA2, contactA1);
  let contactA7 = bookA.addCard(createContact("contact", "A7")); // Add first.
  checkCardsListed(
    contactA7,
    contactA5,
    contactA4,
    contactA3,
    contactA2,
    contactA1
  );
  let contactA0 = bookA.addCard(createContact("contact", "A0")); // Add last.
  checkCardsListed(
    contactA7,
    contactA5,
    contactA4,
    contactA3,
    contactA2,
    contactA1,
    contactA0
  );

  contactA3.displayName = "contact A6";
  contactA3.lastName = "contact A3";
  contactA3.primaryEmail = "contact.A6@invalid";
  bookA.modifyCard(contactA3); // Rename, should change position.
  checkCardsListed(
    contactA7,
    contactA3, // Actually A6.
    contactA5,
    contactA4,
    contactA2,
    contactA1,
    contactA0
  );

  // Restore original sort direction.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  await closeAddressBookWindow();

  let deletePromise = promiseDirectoryRemoved();
  MailServices.ab.deleteAddressBook(bookA.URI);
  await deletePromise;
});

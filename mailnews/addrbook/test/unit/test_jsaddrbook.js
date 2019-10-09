/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var DIR_TYPE = kPABData.dirType;
var FILE_NAME = DIR_TYPE == 101 ? "abook-1.sqlite" : "abook-1.mab";
var SCHEME = DIR_TYPE == 101 ? "jsaddrbook" : "moz-abmdbdirectory";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");

var book, contact, list, listCard;
var observer = {
  setUp() {
    MailServices.ab.addAddressBookListener(observer, Ci.nsIAbListener.all);
    Services.obs.addObserver(observer, "addrbook-contact-created");
    Services.obs.addObserver(observer, "addrbook-contact-updated");
    Services.obs.addObserver(observer, "addrbook-list-updated");
    Services.obs.addObserver(observer, "addrbook-list-member-added");
  },
  cleanUp() {
    MailServices.ab.removeAddressBookListener(observer);
    Services.obs.removeObserver(observer, "addrbook-contact-created");
    Services.obs.removeObserver(observer, "addrbook-contact-updated");
    Services.obs.removeObserver(observer, "addrbook-list-updated");
    Services.obs.removeObserver(observer, "addrbook-list-member-added");
  },

  events: [],
  onItemAdded(parent, item) {
    this.events.push(["onItemAdded", parent, item]);
  },
  onItemRemoved(parent, item) {
    this.events.push(["onItemRemoved", parent, item]);
  },
  onItemPropertyChanged(item, property, oldValue, newValue) {
    this.events.push([
      "onItemPropertyChanged",
      item,
      property,
      oldValue,
      newValue,
    ]);
  },
  observe(subject, topic, data) {
    this.events.push([topic, subject, data]);
  },
  checkEvents(...events) {
    info(
      "Actual events: " +
        JSON.stringify(
          observer.events.map(e =>
            e.map(a => {
              if (a instanceof Ci.nsIAbDirectory) {
                return `[nsIAbDirectory]`;
              }
              if (a instanceof Ci.nsIAbCard) {
                return `[nsIAbCard]`;
              }
              return a;
            })
          )
        )
    );
    equal(observer.events.length, events.length);

    for (let expectedEvent of events) {
      let actualEvent = observer.events.shift();

      for (let i = 0; i < expectedEvent.length; i++) {
        try {
          expectedEvent[i].QueryInterface(Ci.nsIAbCard);
          ok(actualEvent[i].equals(expectedEvent[i]));
        } catch (ex) {
          if (expectedEvent[i] instanceof Ci.nsIAbDirectory) {
            equal(actualEvent[i].UID, expectedEvent[i].UID);
          } else if (expectedEvent[i] !== undefined) {
            equal(actualEvent[i], expectedEvent[i]);
          }
        }
      }
    }
  },
};

add_task(async function setUp() {
  let profileDir = do_get_profile();
  observer.setUp();

  let dirs = [...MailServices.ab.directories];
  equal(dirs.length, 2);
  equal(dirs[0].fileName, kPABData.fileName);
  equal(dirs[1].fileName, kCABData.fileName);

  // Check the PAB file was created.
  let pabFile = profileDir.clone();
  pabFile.append(kPABData.fileName);
  ok(pabFile.exists());

  // Check the CAB file was created.
  let cabFile = profileDir.clone();
  cabFile.append(kCABData.fileName);
  ok(cabFile.exists());
});

add_task(async function createAddressBook() {
  let dirPrefId = MailServices.ab.newAddressBook("new book", "", DIR_TYPE);
  book = MailServices.ab.getDirectoryFromId(dirPrefId);
  observer.checkEvents(["onItemAdded", undefined, book]);

  // Check nsIAbItem properties.
  equal(book.uuid, "ldap_2.servers.newbook&new book");

  // Check nsIAbCollection properties;
  ok(!book.readOnly);
  ok(!book.isRemote);
  ok(!book.isSecure);

  // Check nsIAbDirectory properties.
  equal(book.dirName, "new book");
  equal(book.dirType, DIR_TYPE);
  equal(book.fileName, FILE_NAME);
  equal(book.UID.length, 36);
  equal(book.URI, `${SCHEME}://${FILE_NAME}`);
  equal(book.isMailList, false);
  equal(book.isQuery, false);
  equal(book.supportsMailingLists, true);
  equal(book.dirPrefId, "ldap_2.servers.newbook");

  // Check enumerations.
  equal(Array.from(book.addressLists.enumerate()).length, 0);
  equal(Array.from(book.childNodes).length, 0);
  equal(Array.from(book.childCards).length, 0);

  // Check prefs.
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.description"),
    "new book"
  );
  equal(Services.prefs.getIntPref("ldap_2.servers.newbook.dirType"), DIR_TYPE);
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.filename"),
    FILE_NAME
  );
  equal(Services.prefs.getStringPref("ldap_2.servers.newbook.uid"), book.UID);
  equal([...MailServices.ab.directories].length, 3);

  // Check the file was created.
  let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append(FILE_NAME);
  ok(dbFile.exists());
});

add_task(async function editAddressBook() {
  book.dirName = "updated book";
  observer.checkEvents([
    "onItemPropertyChanged",
    book,
    "DirName",
    "new book",
    "updated book",
  ]);
  equal(book.dirName, "updated book");
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.description"),
    "updated book"
  );
});

add_task(async function createContact() {
  contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = "a new contact";
  contact.firstName = "new";
  contact.lastName = "contact";
  contact.primaryEmail = "test@invalid";
  contact = book.addCard(contact);
  observer.checkEvents(
    ["onItemAdded", book, contact],
    ["addrbook-contact-created", contact, book.UID]
  );

  // Check enumerations.
  let childCards = Array.from(book.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 1);
  ok(childCards[0].equals(contact));

  // Check nsIAbItem properties.
  equal(contact.uuid, "ldap_2.servers.newbook&updated book#1");

  // Check nsIAbItem methods.
  equal(
    contact.generateName(Ci.nsIAbItem.GENERATE_DISPLAY_NAME),
    "a new contact"
  );
  equal(
    contact.generateName(Ci.nsIAbItem.GENERATE_LAST_FIRST_ORDER),
    "contact, new"
  );
  equal(
    contact.generateName(Ci.nsIAbItem.GENERATE_FIRST_LAST_ORDER),
    "new contact"
  );

  // Check nsIAbCard properties.
  equal(contact.directoryId, book.uuid);
  equal(contact.localId, 1);
  equal(contact.UID.length, 36);
  equal(contact.firstName, "new");
  equal(contact.lastName, "contact");
  equal(contact.displayName, "a new contact");
  equal(contact.primaryEmail, "test@invalid");
  equal(contact.isMailList, false);
});

add_task(async function editContact() {
  contact.firstName = "updated";
  contact.lastName = "contact";
  book.modifyCard(contact);
  observer.checkEvents(
    // TODO MDB has three null args but we can do better than that.
    ["onItemPropertyChanged", contact],
    ["addrbook-contact-updated", contact, book.UID]
  );
  equal(contact.firstName, "updated");
  equal(contact.lastName, "contact");
});

add_task(async function createMailingList() {
  list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "new list";
  list = book.addMailList(list);
  // Skip checking events temporarily, until listCard is defined.

  // Check enumerations.
  let addressLists = Array.from(book.addressLists.enumerate(), al =>
    al.QueryInterface(Ci.nsIAbDirectory)
  );
  equal(addressLists.length, 1);
  equal(addressLists[0].UID, list.UID); // TODO Object equality doesn't work because of XPCOM.
  let childNodes = Array.from(book.childNodes, cn =>
    cn.QueryInterface(Ci.nsIAbDirectory)
  );
  equal(childNodes.length, 1);
  equal(childNodes[0].UID, list.UID); // TODO Object equality doesn't work because of XPCOM.
  let childCards = Array.from(book.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 2);
  if (childCards[0].isMailList) {
    listCard = childCards[0];
    ok(childCards[1].equals(contact));
  } else {
    ok(childCards[0].equals(contact));
    listCard = childCards[1];
  }
  equal(listCard.UID, list.UID);

  observer.checkEvents(
    ["onItemAdded", book, listCard],
    ["onItemAdded", book, list]
  );

  // Check nsIAbItem properties.
  equal(list.uuid, "&new list");

  // Check nsIAbDirectory properties.
  equal(list.dirName, "new list");
  equal(list.UID.length, 36);
  equal(list.URI, `${SCHEME}://${FILE_NAME}/MailList1`);
  equal(list.isMailList, true);
  equal(list.isQuery, false);
  equal(list.supportsMailingLists, false);

  // Check list enumerations.
  equal(Array.from(list.addressLists.enumerate()).length, 0);
  equal(Array.from(list.childNodes).length, 0);
  equal(Array.from(list.childCards).length, 0);
});

add_task(async function editMailingList() {
  list.dirName = "updated list";
  list.editMailListToDatabase(null);
  observer.checkEvents(
    ["onItemPropertyChanged", list, "DirName", undefined, "updated list"],
    ["onItemPropertyChanged", list, "DirName", undefined, "updated list"], // Seriously?
    ["addrbook-list-updated", list, null]
  );
  equal("updated list", list.dirName);
});

add_task(async function addMailingListMember() {
  list.addCard(contact);
  observer.checkEvents(
    ["onItemPropertyChanged", contact, null, null, null],
    ["onItemPropertyChanged", contact, null, null, null],
    ["onItemAdded", book, contact],
    ["onItemAdded", list, contact]
    // ["addrbook-list-member-added", contact, list.UID] // MDB fires this on dropcard but not addcard?!
  );
  equal(1, list.addressLists.Count());

  // Check list enumerations.
  let addressLists = Array.from(list.addressLists.enumerate(), al =>
    al.QueryInterface(Ci.nsIAbCard)
  );
  equal(addressLists.length, 1);
  ok(addressLists[0].equals(contact));
  equal(Array.from(list.childNodes).length, 0);
  let childCards = Array.from(list.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 1);
  ok(childCards[0].equals(contact));
});

add_task(async function removeMailingListMember() {
  let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  cardArray.appendElement(contact);
  list.deleteCards(cardArray);
  equal(0, list.addressLists.Count());
  observer.checkEvents(["onItemRemoved", list, contact]);

  // Check list enumerations.
  equal(Array.from(list.addressLists.enumerate()).length, 0);
  equal(Array.from(list.childNodes).length, 0);
  equal(Array.from(list.childCards).length, 0);
});

add_task(async function deleteMailingList() {
  MailServices.ab.deleteAddressBook(list.URI);
  observer.checkEvents(
    ["onItemRemoved", book, listCard],
    ["onItemRemoved", list, listCard],
    ["onItemRemoved", book, list]
  );
});

add_task(async function deleteContact() {
  let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  cardArray.appendElement(contact);
  book.deleteCards(cardArray);
  observer.checkEvents(["onItemRemoved", book, contact]);

  // Check enumerations.
  equal(Array.from(book.addressLists.enumerate()).length, 0);
  equal(Array.from(book.childNodes).length, 0);
  equal(Array.from(book.childCards).length, 0);
});

add_task(async function deleteAddressBook() {
  MailServices.ab.deleteAddressBook(book.URI);
  // Wait for files to close.
  await new Promise(resolve => setTimeout(resolve, 2000));

  observer.checkEvents(["onItemRemoved", undefined, book]);
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.dirType"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.description"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.filename"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.uid"));
  let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append(FILE_NAME);
  ok(!dbFile.exists());
  equal([...MailServices.ab.directories].length, 2);
  if (DIR_TYPE == 101) {
    throws(
      () => MailServices.ab.getDirectory(`${SCHEME}://${FILE_NAME}`),
      /.*/
    );
  }
});

add_task(async function cleanUp() {
  observer.checkEvents();
  observer.cleanUp();
});

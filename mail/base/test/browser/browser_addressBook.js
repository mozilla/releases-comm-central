/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const tabmail = document.getElementById("tabmail");

add_task(async function test_addressBookNavigation() {
  Assert.notEqual(
    tabmail.currentTabInfo.mode.type,
    "addressBookTab",
    "Should not be at the address book"
  );

  const addressBookDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-created"
  );

  const dirPrefId = MailServices.ab.newAddressBook(
    "test book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  const directory = MailServices.ab.getDirectoryFromId(dirPrefId);
  let addressBookWindow;

  const { promise, resolve } = Promise.withResolvers();

  tabmail.openTab("addressBookTab", {
    onLoad(event, browser) {
      addressBookWindow = browser.contentWindow;
      addressBookWindow.commandController?.doCommand(
        "cmd_displayAddressBook",
        directory.UID
      );
      resolve();
    },
  });

  await promise;

  Assert.equal(
    tabmail.currentTabInfo.mode.type,
    "addressBookTab",
    "Should have navigated to address book"
  );

  // Check existence of address book.
  const [addressBookDirectory] = await addressBookDirectoryPromise;
  Assert.equal(
    addressBookDirectory.dirName,
    "test book",
    "Address book should be created"
  );

  Assert.equal(
    tabmail.currentTabInfo.mode.type,
    "addressBookTab",
    "Should have navigated to address book"
  );

  const booksList =
    tabmail.currentTabInfo.browser.contentWindow.document.getElementById(
      "books"
    );
  const index = booksList.getIndexForUID(directory.UID);

  Assert.equal(
    booksList.selectedIndex,
    index,
    "Correct address book should be selected"
  );
  Assert.equal(
    tabmail.currentTabInfo.browser.contentDocument.activeElement.id,
    "searchInput",
    "Search input should have focus"
  );

  tabmail.closeOtherTabs(0);

  MailServices.ab.deleteAddressBook(addressBookDirectory.URI);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MailServices */

async function openAddressBookWindow() {
  let addressBookWindowPromise = BrowserTestUtils.domWindowOpened(
    null,
    async win => {
      // This test function waits until the "load" event has happened.
      await BrowserTestUtils.waitForEvent(win, "load");

      return (
        win.document.documentURI ==
        "chrome://messenger/content/addressbook/addressbook.xhtml"
      );
    }
  );

  const addressBookButton = document.getElementById("button-address");
  EventUtils.synthesizeMouseAtCenter(addressBookButton, { clickCount: 1 });

  let abWindow = await addressBookWindowPromise;

  await new Promise(resolve => abWindow.setTimeout(resolve));

  ok(abWindow && abWindow instanceof Window, "address book window was opened");

  return abWindow;
}

async function createNewAddressBook(abWindow, abName) {
  let newAddressBookPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml",
    abNameDialog => {
      EventUtils.sendString(abName, abNameDialog);
      abNameDialog.document
        .querySelector("dialog")
        .getButton("accept")
        .click();
    }
  );

  // Using the UI was unreliable so just call the function.
  abWindow.AbNewAddressBook();

  await newAddressBookPromise;

  let addressBook = [...MailServices.ab.directories].find(
    directory => directory.dirName == abName
  );

  ok(addressBook, "a new address book was created");

  return addressBook;
}

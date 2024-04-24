/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MailServices, MailUtils */

var { DisplayNameUtils } = ChromeUtils.importESModule(
  "resource:///modules/DisplayNameUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

const inputs = {
  abName: "Mochitest Address Book",
  mlName: "Mochitest Mailing List",
  nickName: "Nicky",
  description: "Just a test mailing list.",
  addresses: [
    "alan@example.com",
    "betty@example.com",
    "clyde@example.com",
    "deb@example.com",
  ],
  modification: " (modified)",
};

const getDisplayedAddress = address => `${address} <${address}>`;

let global = {};

/**
 * Set up: create a new address book to hold the mailing list.
 */
add_task(async () => {
  const bookPrefName = MailServices.ab.newAddressBook(
    inputs.abName,
    null,
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  const addressBook = MailServices.ab.getDirectoryFromId(bookPrefName);

  const abWindow = await openAddressBookWindow();

  global = {
    abWindow,
    addressBook,
    booksList: abWindow.booksList,
    mailListUID: undefined,
  };
});

/**
 * Create a new mailing list with some addresses, in the new address book.
 */
add_task(async () => {
  const mailingListWindowPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  ).then(async function (mlWindow) {
    const mlDocument = mlWindow.document;
    const mlDocElement = mlDocument.querySelector("dialog");

    const listName = mlDocument.getElementById("ListName");
    if (mlDocument.activeElement != listName) {
      await BrowserTestUtils.waitForEvent(listName, "focus");
    }

    const abPopup = mlDocument.getElementById("abPopup");
    const listNickName = mlDocument.getElementById("ListNickName");
    const listDescription = mlDocument.getElementById("ListDescription");
    const addressInput1 = mlDocument.getElementById("addressCol1#1");
    const addressInputsCount = mlDocument
      .getElementById("addressingWidget")
      .querySelectorAll("input").length;

    Assert.equal(
      abPopup.label,
      global.addressBook.dirName,
      "the correct address book is selected in the menu"
    );
    Assert.equal(
      abPopup.value,
      global.addressBook.URI,
      "the address book selected in the menu has the correct address book URI"
    );
    Assert.equal(listName.value, "", "no text in the list name field");
    Assert.equal(listNickName.value, "", "no text in the list nickname field");
    Assert.equal(listDescription.value, "", "no text in the description field");
    Assert.equal(addressInput1.value, "", "no text in the addresses list");
    Assert.equal(addressInputsCount, 1, "only one address list input exists");

    EventUtils.sendString(inputs.mlName, mlWindow);

    // Tab to nickname input.
    EventUtils.sendKey("TAB", mlWindow);
    EventUtils.sendString(inputs.nickName, mlWindow);

    // Tab to description input.
    EventUtils.sendKey("TAB", mlWindow);
    EventUtils.sendString(inputs.description, mlWindow);

    // Tab to address input and add addresses zero and one by entering
    // both of them there.
    EventUtils.sendKey("TAB", mlWindow);
    EventUtils.sendString(inputs.addresses.slice(0, 2).join(", "), mlWindow);

    mlDocElement.getButton("accept").click();
  });

  // Select the address book.
  await openDirectory(global.addressBook);

  // Open the new mailing list dialog, the callback above interacts with it.
  EventUtils.synthesizeMouseAtCenter(
    global.abWindow.document.getElementById("toolbarCreateList"),
    { clickCount: 1 },
    global.abWindow
  );

  await mailingListWindowPromise;

  // Confirm that the mailing list and addresses were saved in the backend.

  Assert.ok(
    MailServices.ab.cardForEmailAddress(inputs.addresses[0]),
    "address zero was saved"
  );
  Assert.ok(
    MailServices.ab.cardForEmailAddress(inputs.addresses[1]),
    "address one was saved"
  );

  const childCards = global.addressBook.childCards;

  Assert.ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[0]),
    "address zero was saved in the correct address book"
  );
  Assert.ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[1]),
    "address one was saved in the correct address book"
  );

  const mailList = MailUtils.findListInAddressBooks(inputs.mlName);

  // Save the mailing list UID so we can confirm it is the same later.
  global.mailListUID = mailList.UID;

  Assert.ok(mailList, "mailing list was created");
  Assert.ok(
    global.addressBook.hasMailListWithName(inputs.mlName),
    "mailing list was created in the correct address book"
  );
  Assert.equal(mailList.dirName, inputs.mlName, "mailing list name was saved");
  Assert.equal(
    mailList.listNickName,
    inputs.nickName,
    "mailing list nick name was saved"
  );
  Assert.equal(
    mailList.description,
    inputs.description,
    "mailing list description was saved"
  );

  const listCards = mailList.childCards;
  Assert.equal(listCards.length, 2, "two cards exist in the mailing list");
  Assert.ok(
    listCards[0].hasEmailAddress(inputs.addresses[0]),
    "address zero was saved in the mailing list"
  );
  Assert.ok(
    listCards[1].hasEmailAddress(inputs.addresses[1]),
    "address one was saved in the mailing list"
  );
});

/**
 * Open the mailing list dialog and modify the mailing list.
 */
add_task(async () => {
  const mailingListWindowPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  ).then(async function (mlWindow) {
    const mlDocument = mlWindow.document;
    const mlDocElement = mlDocument.querySelector("dialog");

    if (!mlDocument.getElementById("addressCol1#3")) {
      // The address input nodes are not there yet when the dialog window is
      // loaded, so wait until they exist.
      await mailTestUtils.awaitElementExistence(
        MutationObserver,
        mlDocument,
        "addressingWidget",
        "addressCol1#3"
      );
    }

    if (mlDocument.activeElement.id != "addressCol1#3") {
      await BrowserTestUtils.waitForEvent(
        mlDocument.getElementById("addressCol1#3"),
        "focus"
      );
    }

    const listName = mlDocument.getElementById("ListName");
    const listNickName = mlDocument.getElementById("ListNickName");
    const listDescription = mlDocument.getElementById("ListDescription");
    const addressInput1 = mlDocument.getElementById("addressCol1#1");
    const addressInput2 = mlDocument.getElementById("addressCol1#2");

    Assert.equal(
      listName.value,
      inputs.mlName,
      "list name is displayed correctly"
    );
    Assert.equal(
      listNickName.value,
      inputs.nickName,
      "list nickname is displayed correctly"
    );
    Assert.equal(
      listDescription.value,
      inputs.description,
      "list description is displayed correctly"
    );
    Assert.equal(
      addressInput1 && addressInput1.value,
      getDisplayedAddress(inputs.addresses[0]),
      "address zero is displayed correctly"
    );
    Assert.equal(
      addressInput2 && addressInput2.value,
      getDisplayedAddress(inputs.addresses[1]),
      "address one is displayed correctly"
    );

    const textInputs = mlDocument.querySelectorAll(".textbox-addressingWidget");
    Assert.equal(textInputs.length, 3, "no extraneous addresses are displayed");

    // Add addresses two and three.
    EventUtils.sendString(inputs.addresses.slice(2, 4).join(", "), mlWindow);
    EventUtils.sendKey("RETURN", mlWindow);
    await new Promise(resolve => mlWindow.setTimeout(resolve));

    // Delete the address in the second row (address one).
    EventUtils.synthesizeMouseAtCenter(
      addressInput2,
      { clickCount: 1 },
      mlWindow
    );
    EventUtils.synthesizeKey("a", { accelKey: true }, mlWindow);
    EventUtils.sendKey("BACK_SPACE", mlWindow);

    // Modify the list's name, nick name, and description fields.
    const modifyField = id => {
      id.focus();
      EventUtils.sendKey("DOWN", mlWindow);
      EventUtils.sendString(inputs.modification, mlWindow);
    };
    modifyField(listName);
    modifyField(listNickName);
    modifyField(listDescription);

    mlDocElement.getButton("accept").click();
  });

  // Open the mailing list dialog, the callback above interacts with it.
  global.booksList.selectedIndex = 3;
  global.booksList.showPropertiesOfSelected();

  await mailingListWindowPromise;

  // Confirm that the mailing list and addresses were saved in the backend.

  Assert.equal(
    global.booksList.getRowAtIndex(3).querySelector("span").textContent,
    inputs.mlName + inputs.modification,
    `mailing list ("${
      inputs.mlName + inputs.modification
    }") is displayed in the address book list`
  );

  Assert.ok(
    MailServices.ab.cardForEmailAddress(inputs.addresses[2]),
    "address two was saved"
  );
  Assert.ok(
    MailServices.ab.cardForEmailAddress(inputs.addresses[3]),
    "address three was saved"
  );

  const childCards = global.addressBook.childCards;

  Assert.ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[2]),
    "address two was saved in the correct address book"
  );
  Assert.ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[3]),
    "address three was saved in the correct address book"
  );

  const mailList = MailUtils.findListInAddressBooks(
    inputs.mlName + inputs.modification
  );

  Assert.equal(
    mailList && mailList.UID,
    global.mailListUID,
    "mailing list still exists"
  );

  Assert.ok(
    global.addressBook.hasMailListWithName(inputs.mlName + inputs.modification),
    "mailing list is still in the correct address book"
  );
  Assert.equal(
    mailList.dirName,
    inputs.mlName + inputs.modification,
    "modified mailing list name was saved"
  );
  Assert.equal(
    mailList.listNickName,
    inputs.nickName + inputs.modification,
    "modified mailing list nick name was saved"
  );
  Assert.equal(
    mailList.description,
    inputs.description + inputs.modification,
    "modified mailing list description was saved"
  );

  const listCards = mailList.childCards;

  Assert.equal(listCards.length, 3, "three cards exist in the mailing list");

  Assert.ok(
    listCards[0].hasEmailAddress(inputs.addresses[0]),
    "address zero was saved in the mailing list (is still there)"
  );
  Assert.ok(
    listCards[1].hasEmailAddress(inputs.addresses[2]),
    "address two was saved in the mailing list"
  );
  Assert.ok(
    listCards[2].hasEmailAddress(inputs.addresses[3]),
    "address three was saved in the mailing list"
  );

  const hasAddressOne = listCards.find(card =>
    card.hasEmailAddress(inputs.addresses[1])
  );

  Assert.ok(!hasAddressOne, "address one was deleted from the mailing list");
});

/**
 * Open the mailing list dialog and confirm the changes are displayed.
 */
add_task(async () => {
  const mailingListWindowPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  ).then(async function (mailingListWindow) {
    const mlDocument = mailingListWindow.document;
    const mlDocElement = mlDocument.querySelector("dialog");

    if (!mlDocument.getElementById("addressCol1#4")) {
      // The address input nodes are not there yet when the dialog window is
      // loaded, so wait until they exist.
      await mailTestUtils.awaitElementExistence(
        MutationObserver,
        mlDocument,
        "addressingWidget",
        "addressCol1#4"
      );
    }

    if (mlDocument.activeElement.id != "addressCol1#4") {
      await BrowserTestUtils.waitForEvent(
        mlDocument.getElementById("addressCol1#4"),
        "focus"
      );
    }

    const listName = mlDocument.getElementById("ListName");
    const listNickName = mlDocument.getElementById("ListNickName");
    const listDescription = mlDocument.getElementById("ListDescription");
    const addressInput1 = mlDocument.getElementById("addressCol1#1");
    const addressInput2 = mlDocument.getElementById("addressCol1#2");
    const addressInput3 = mlDocument.getElementById("addressCol1#3");

    Assert.equal(
      listName.value,
      inputs.mlName + inputs.modification,
      "modified list name is displayed correctly"
    );
    Assert.equal(
      listNickName.value,
      inputs.nickName + inputs.modification,
      "modified list nickname is displayed correctly"
    );
    Assert.equal(
      listDescription.value,
      inputs.description + inputs.modification,
      "modified list description is displayed correctly"
    );
    Assert.equal(
      addressInput1 && addressInput1.value,
      getDisplayedAddress(inputs.addresses[0]),
      "address zero is displayed correctly (is still there)"
    );
    Assert.equal(
      addressInput2 && addressInput2.value,
      getDisplayedAddress(inputs.addresses[2]),
      "address two is displayed correctly"
    );
    Assert.equal(
      addressInput3 && addressInput3.value,
      getDisplayedAddress(inputs.addresses[3]),
      "address three is displayed correctly"
    );

    const textInputs = mlDocument.querySelectorAll(".textbox-addressingWidget");
    Assert.equal(textInputs.length, 4, "no extraneous addresses are displayed");

    mlDocElement.getButton("cancel").click();
  });

  Assert.equal(
    global.booksList.getRowAtIndex(3).querySelector("span").textContent,
    inputs.mlName + inputs.modification,
    `mailing list ("${
      inputs.mlName + inputs.modification
    }") is still displayed in the address book list`
  );

  // Open the mailing list dialog, the callback above interacts with it.
  global.booksList.selectedIndex = 3;
  global.booksList.showPropertiesOfSelected();

  await mailingListWindowPromise;
});

/**
 * Tear down: delete the address book and close the address book window.
 */
add_task(async () => {
  const mailingListWindowPromise = BrowserTestUtils.promiseAlertDialog(
    "accept",
    "chrome://global/content/commonDialog.xhtml"
  );
  const deletePromise = TestUtils.topicObserved("addrbook-directory-deleted");

  Assert.equal(
    global.booksList.getRowAtIndex(2).querySelector("span").textContent,
    inputs.abName,
    `address book ("${inputs.abName}") is displayed in the address book list`
  );

  global.booksList.focus();
  global.booksList.selectedIndex = 2;
  EventUtils.sendKey("DELETE", global.abWindow);

  await Promise.all([mailingListWindowPromise, deletePromise]);

  const addressBook = MailServices.ab.directories.find(
    directory => directory.dirName == inputs.abName
  );

  Assert.ok(!addressBook, "address book was deleted");

  closeAddressBookWindow();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the UI for exporting address books. Note this doesn't really test the
 * exporting itself, there's an XPCShell test for that.
 */

const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

let book, list;

add_setup(async function () {
  book = createAddressBook("book");
  book.addCard(createContact("contact", "A"));
  const contactB = book.addCard(createContact("contact", "B"));
  const contactC = book.addCard(createContact("contact", "C"));

  list = book.addMailList(createMailingList("list"));
  list.addCard(contactB);
  list.addCard(contactC);

  await openAddressBookWindow();

  MockFilePicker.init(window.browsingContext);
  MockFilePicker.useAnyFile();

  MockFilePicker.appendFilterCallback = function (picker, title, filter) {
    MockFilePicker.testFilters.push(filter);
  };

  MockFilePicker.showCallback = function (picker) {
    MockFilePicker.defaultString = picker.defaultString;
    if (AppConstants.platform == "win") {
      // Windows has encoding-specific versions of CSV/TSV export.
      Assert.deepEqual(MockFilePicker.testFilters, [
        "*.csv",
        "*.csv",
        "*.tab; *.txt",
        "*.tab; *.txt",
        "*.vcf",
        "*.ldi; *.ldif",
      ]);
    } else {
      Assert.deepEqual(MockFilePicker.testFilters, [
        "*.csv",
        "*.tab; *.txt",
        "*.vcf",
        "*.ldi; *.ldif",
      ]);
    }
    picker.filterIndex = MockFilePicker.testFilters.findIndex(f =>
      f.includes(`*.${MockFilePicker.testExtension}`)
    );
    return MockFilePicker.returnOK;
  };

  registerCleanupFunction(async function () {
    await closeAddressBookWindow();
    await promiseDirectoryRemoved(book.URI);
    MockFilePicker.cleanup();
  });
});

async function promiseExport(extension) {
  MockFilePicker.testFilters = [];
  MockFilePicker.testExtension = extension;

  const [exportFile] = await TestUtils.topicObserved(
    "addrbook-export-completed"
  );

  const contents = await IOUtils.readUTF8(exportFile.path);
  await IOUtils.remove(exportFile.path);

  return contents;
}

async function exportFromBooksContext(directory, extension) {
  const exportPromise = promiseExport(extension);

  const abWindow = getAddressBookWindow();
  const booksList = abWindow.booksList;
  await showBooksContext(
    booksList.getIndexForUID(directory.UID),
    "bookContextExport"
  );

  const contents = await exportPromise;
  Assert.equal(
    MockFilePicker.defaultString,
    directory.isMailList ? "list" : "book"
  );
  return contents;
}

async function exportListFromCardsContext(extension) {
  const exportPromise = promiseExport(extension);

  await openDirectory(book);
  // The list is the fourth item, after the contacts.
  await showCardsContext(3, "cardContextExport");

  const contents = await exportPromise;
  Assert.equal(MockFilePicker.defaultString, "list");
  return contents;
}

async function exportCardsFromCardsContext(indices, expectedName, extension) {
  const exportPromise = promiseExport(extension);

  await openDirectory(book);
  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;

  cardsList.selectedIndices = indices;
  await showCardsContext(indices.at(-1), "cardContextExport");

  const contents = await exportPromise;
  Assert.equal(MockFilePicker.defaultString, expectedName);
  Assert.equal(
    contents.includes("contact A"),
    indices.includes(0),
    "export includes contact A"
  );
  Assert.equal(
    contents.includes("contact B"),
    indices.includes(1),
    "export includes contact B"
  );
  Assert.equal(
    contents.includes("contact C"),
    indices.includes(2),
    "export includes contact C"
  );
  Assert.equal(contents.includes("list"), false, "export includes list");

  return contents;
}

add_task(async function testCSV() {
  Assert.stringContains(
    await exportFromBooksContext(book, "csv"),
    ",contact A,",
    "book exported from books context should be in CSV format"
  );
  Assert.stringContains(
    await exportFromBooksContext(list, "csv"),
    ",contact B,",
    "list exported from books context should be in CSV format"
  );
  Assert.stringContains(
    await exportListFromCardsContext("csv"),
    ",contact C,",
    "list exported from cards context should be in CSV format"
  );

  Assert.stringContains(
    await exportCardsFromCardsContext([0], "contact A", "csv"),
    "First Name,Last Name,",
    "cards exported from cards context should be in CSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([1], "contact B", "csv"),
    ",Display Name,Nickname,",
    "cards exported from cards context should be in CSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([2], "contact C", "csv"),
    ",Primary Email,",
    "cards exported from cards context should be in CSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([0, 1], "Contacts", "csv"),
    ",Secondary Email,",
    "cards exported from cards context should be in CSV format"
  );
});

add_task(async function testTSV() {
  Assert.stringContains(
    await exportFromBooksContext(book, "tab"),
    "\tcontact A\t",
    "book exported from books context should be in TSV format"
  );
  Assert.stringContains(
    await exportFromBooksContext(list, "tab"),
    "\tcontact B\t",
    "list exported from books context should be in TSV format"
  );
  Assert.stringContains(
    await exportListFromCardsContext("tab"),
    "\tcontact C\t",
    "list exported from cards context should be in TSV format"
  );

  Assert.stringContains(
    await exportCardsFromCardsContext([0], "contact A", "tab"),
    "First Name\tLast Name\t",
    "cards exported from cards context should be in TSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([1], "contact B", "tab"),
    "\tDisplay Name\tNickname\t",
    "cards exported from cards context should be in TSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([2], "contact C", "tab"),
    "\tPrimary Email\t",
    "cards exported from cards context should be in TSV format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([0, 1], "Contacts", "tab"),
    "\tSecondary Email\t",
    "cards exported from cards context should be in TSV format"
  );
});

add_task(async function testVCF() {
  Assert.stringContains(
    await exportFromBooksContext(book, "vcf"),
    "\r\nFN:contact A\r\n",
    "book exported from books context should be in vCard format"
  );
  Assert.stringContains(
    await exportFromBooksContext(list, "vcf"),
    "\r\nFN:contact B\r\n",
    "list exported from books context should be in vCard format"
  );
  Assert.stringContains(
    await exportListFromCardsContext("vcf"),
    "\r\nFN:contact C\r\n",
    "list exported from cards context should be in vCard format"
  );

  Assert.stringContains(
    await exportCardsFromCardsContext([0], "contact A", "vcf"),
    "BEGIN:VCARD\r\n",
    "cards exported from cards context should be in vCard format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([1], "contact B", "vcf"),
    "END:VCARD\r\n",
    "cards exported from cards context should be in vCard format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([2], "contact C", "vcf"),
    "BEGIN:VCARD\r\n",
    "cards exported from cards context should be in vCard format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([0, 1], "Contacts", "vcf"),
    "END:VCARD\r\nBEGIN:VCARD\r\n",
    "cards exported from cards context should be in vCard format"
  );
});

add_task(async function testLDIF() {
  const LINEBREAK = AppConstants.platform == "win" ? "\r\n" : "\n";

  Assert.stringContains(
    await exportFromBooksContext(book, "ldif"),
    `${LINEBREAK}cn: contact A${LINEBREAK}`,
    "book exported from books context should be in LDIF format"
  );
  Assert.stringContains(
    await exportFromBooksContext(list, "ldif"),
    `${LINEBREAK}cn: contact B${LINEBREAK}`,
    "list exported from books context should be in LDIF format"
  );
  Assert.stringContains(
    await exportListFromCardsContext("ldif"),
    `${LINEBREAK}cn: contact C${LINEBREAK}`,
    "list exported from cards context should be in LDIF format"
  );

  Assert.stringContains(
    await exportCardsFromCardsContext([0], "contact A", "ldif"),
    `${LINEBREAK}objectclass: person${LINEBREAK}`,
    "cards exported from cards context should be in LDIF format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([1], "contact B", "ldif"),
    `${LINEBREAK}objectclass: organizationalPerson${LINEBREAK}`,
    "cards exported from cards context should be in LDIF format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([2], "contact C", "ldif"),
    `${LINEBREAK}objectclass: inetOrgPerson${LINEBREAK}`,
    "cards exported from cards context should be in LDIF format"
  );
  Assert.stringContains(
    await exportCardsFromCardsContext([0, 1], "Contacts", "ldif"),
    `${LINEBREAK}objectclass: mozillaAbPersonAlpha${LINEBREAK}`,
    "cards exported from cards context should be in LDIF format"
  );
});

add_task(async function testMixedSelection() {
  await openDirectory(book);
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abWindow.cardsPane.cardsList;
  const menu = abDocument.getElementById("cardContext");
  const exportItem = abWindow.document.getElementById("cardContextExport");

  for (const indices of [
    [0, 1, 2, 3],
    [0, 3],
  ]) {
    cardsList.selectedIndices = indices;
    await showCardsContext(indices.at(-1));
    Assert.ok(exportItem.hidden, "unable to export selection including a list");
    menu.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(menu, "hidden");
    await new Promise(resolve => abWindow.setTimeout(resolve));
  }
});

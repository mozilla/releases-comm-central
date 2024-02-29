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
  });
});

async function promiseExport(directory, extension) {
  MockFilePicker.testFilters = [];
  MockFilePicker.testExtension = extension;

  const [exportFile, directoryUID] = await TestUtils.topicObserved(
    "addrbook-export-completed"
  );
  Assert.equal(directoryUID, directory.UID);

  const contents = await IOUtils.readUTF8(exportFile.path);
  await IOUtils.remove(exportFile.path);

  return contents;
}

async function exportFromBooksContext(directory, extension) {
  const exportPromise = promiseExport(directory, extension);

  const abWindow = getAddressBookWindow();
  const booksList = abWindow.booksList;
  await showBooksContext(
    booksList.getIndexForUID(directory.UID),
    "bookContextExport"
  );

  return exportPromise;
}

async function exportFromCardsContext(directory, extension) {
  const exportPromise = promiseExport(directory, extension);

  openDirectory(book);
  // The list is the fourth item, after the contacts.
  await showCardsContext(3, "cardContextExport");

  return exportPromise;
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
    await exportFromCardsContext(list, "csv"),
    ",contact C,",
    "list exported from cards context should be in CSV format"
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
    await exportFromCardsContext(list, "vcf"),
    "\r\nFN:contact C\r\n",
    "list exported from cards context should be in vCard format"
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
    await exportFromCardsContext(list, "ldif"),
    `${LINEBREAK}cn: contact C${LINEBREAK}`,
    "list exported from cards context should be in LDIF format"
  );
});

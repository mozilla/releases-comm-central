/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests importing address book files in each format. For each format we
 * import the same contact, and if the format supports it, a list
 * containing the contact. This isn't meant to be a test of the capabilities
 * of each importer, just enough to prove that each is working.
 */

const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let abWindow, importWin, importDoc;

const dataDir = getChromeDir(getResolvedURI(gTestPath));
dataDir.append("data");

let pickerFilters = [];

add_setup(async function () {
  abWindow = await openAddressBookWindow();

  MockFilePicker.init(window.browsingContext);

  registerCleanupFunction(async function () {
    MockFilePicker.cleanup();
    await closeAddressBookWindow();
  });
});

async function startImport() {
  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );

  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("booksPaneImport"),
    {},
    abWindow
  );
  const {
    detail: { tabInfo },
  } = await tabOpenPromise;
  if (
    tabInfo.browser.docShell?.isLoadingDocument ||
    !tabInfo.browser.currentURI?.spec.startsWith("about:import")
  ) {
    await BrowserTestUtils.browserLoaded(tabInfo.browser);
  }

  importWin = tabInfo.browser.contentWindow;
  importDoc = tabInfo.browser.contentDocument;
  await SimpleTest.promiseFocus(importWin);

  const sourcesPane = importDoc.getElementById("addr-book-sources");
  const fieldMapPane = importDoc.getElementById("addr-book-csvFieldMap");
  const directoriesPane = importDoc.getElementById("addr-book-directories");
  const summaryPane = importDoc.getElementById("addr-book-summary");

  Assert.ok(BrowserTestUtils.isVisible(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(fieldMapPane));
  Assert.ok(BrowserTestUtils.isHidden(directoriesPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));
}

function chooseFileType(type) {
  const sourcesPane = importDoc.getElementById("addr-book-sources");
  const radio = sourcesPane.querySelector(
    `input[type="radio"][value="${type}"]`
  );
  EventUtils.synthesizeMouseAtCenter(radio, {}, importWin);
  Assert.ok(radio.checked, `${type} radio should be checked`);
}

function listenForFilters() {
  pickerFilters = [];
  MockFilePicker.appendFilterCallback = function (picker, title, filter) {
    pickerFilters.push(filter);
  };
  MockFilePicker.appendFiltersCallback = function (picker, filter) {
    Assert.equal(
      filter,
      Ci.nsIFilePicker.filterAll,
      "only filterAll should be passed to appendFilters"
    );
    pickerFilters.push("*.*");
  };
}

async function doImport(destinationValue, expectedFilters, expectedPath) {
  const nextButton = importDoc.getElementById("addrBookNextButton");
  const sourcesPane = importDoc.getElementById("addr-book-sources");
  const fieldMapPane = importDoc.getElementById("addr-book-csvFieldMap");
  const directoriesPane = importDoc.getElementById("addr-book-directories");
  const summaryPane = importDoc.getElementById("addr-book-summary");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(directoriesPane),
    "waiting for the directories pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(fieldMapPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));

  Assert.deepEqual(
    pickerFilters,
    expectedFilters,
    "file picker filters should match the selected type"
  );
  Assert.equal(
    importDoc.getElementById("addrBookSourcePath").textContent,
    expectedPath,
    "the displayed file path is correct"
  );

  const directoryRadios = [
    ...directoriesPane.querySelectorAll(`input[type="radio"]`),
  ];
  Assert.equal(
    directoryRadios.length,
    3,
    "there should be 3 destination address books"
  );
  Assert.equal(
    directoryRadios[0].value,
    personalBook.dirPrefId,
    "the personal address book should be listed"
  );
  Assert.equal(
    directoryRadios[1].value,
    historyBook.dirPrefId,
    "the collected addresses book should be listed"
  );
  Assert.equal(
    directoryRadios[2].value,
    ".new",
    "there should be an option for a new address book"
  );
  Assert.deepEqual(
    importDoc.l10n.getAttributes(directoryRadios[2].nextElementSibling),
    {
      id: "addr-book-import-into-new-directory2",
      args: {
        addressBookName: "import",
      },
    },
    "the new address book name should include the file name"
  );
  EventUtils.synthesizeMouseAtCenter(
    directoryRadios.find(r => r.value == destinationValue),
    {},
    importWin
  );

  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(summaryPane),
    "waiting for the summary pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(fieldMapPane));
  Assert.ok(BrowserTestUtils.isHidden(directoriesPane));

  EventUtils.synthesizeMouseAtCenter(
    importDoc.getElementById("addrBookStartImport"),
    {},
    importWin
  );
  await TestUtils.waitForCondition(() =>
    importDoc.querySelector("#tabPane-addressBook.complete")
  );

  const tabClosePromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabClose"
  );
  EventUtils.synthesizeMouseAtCenter(
    summaryPane.querySelector("button.progressFinish"),
    {},
    importWin
  );
  await tabClosePromise;
}

function checkImported(destinationBook, listsSupported) {
  const importedCards = destinationBook.childCards;
  Assert.equal(
    importedCards.length,
    listsSupported ? 2 : 1,
    `1 contact${listsSupported ? "and 1 list" : ""} should be imported`
  );

  if (listsSupported) {
    Assert.ok(importedCards.at(0).isMailList);
    Assert.equal(importedCards.at(0).displayName, "list");

    const importedLists = destinationBook.childNodes;
    Assert.equal(importedLists.length, 1);
    Assert.equal(importedLists.at(0).dirName, "list");
    Assert.equal(importedLists.at(0).listNickName, "nick name");
    Assert.equal(importedLists.at(0).description, "a list of cards");

    destinationBook.deleteDirectory(importedLists[0]);
  }

  Assert.equal(importedCards.at(-1).displayName, "contact number one");
  Assert.equal(importedCards.at(-1).primaryEmail, "contact1@invalid");

  destinationBook.deleteCards(importedCards);
}

add_task(async function testImportCSV() {
  const csvFile = dataDir.clone();
  csvFile.append("import.csv");
  await startImport();

  const nextButton = importDoc.getElementById("addrBookNextButton");
  const sourcesPane = importDoc.getElementById("addr-book-sources");
  const fieldMapPane = importDoc.getElementById("addr-book-csvFieldMap");
  const directoriesPane = importDoc.getElementById("addr-book-directories");
  const summaryPane = importDoc.getElementById("addr-book-summary");

  // Choose a file and move to the next step. This is a CSV file in a format
  // we don't understand, so we must set up the fields.

  MockFilePicker.reset();
  MockFilePicker.setFiles([csvFile]);
  listenForFilters();
  chooseFileType("csv");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(fieldMapPane),
    "waiting for the field map pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(directoriesPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));
  Assert.equal(
    importDoc.getElementById("addrBookSourcePath").textContent,
    csvFile.path,
    "the displayed file path is correct"
  );

  const fieldMap = fieldMapPane.querySelector("csv-field-map");
  const fieldMapTable = fieldMap.querySelector("table");
  const fieldMapRows = fieldMapTable.tBodies[0].rows;
  Assert.equal(
    fieldMapRows.length,
    2,
    "there should be 2 rows in the field map"
  );
  fieldMapRows[0].querySelector("select").value = [
    ...fieldMapRows[0].querySelectorAll("option"),
  ].find(o => o.textContent == "Display Name").value;
  fieldMapRows[1].querySelector("select").value = [
    ...fieldMapRows[1].querySelectorAll("option"),
  ].find(o => o.textContent == "Primary Email").value;

  // Now move on to the actual importing.

  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);
  await doImport(
    personalBook.dirPrefId,
    ["*.csv; *.tsv; *.tab", "*.*"],
    csvFile.path
  );

  // Check what was imported.

  checkImported(personalBook, false);
});

add_task(async function testImportLDIF() {
  const ldifFile = dataDir.clone();
  ldifFile.append("import.ldif");
  await startImport();

  const nextButton = importDoc.getElementById("addrBookNextButton");

  MockFilePicker.reset();
  MockFilePicker.setFiles([ldifFile]);
  listenForFilters();
  chooseFileType("ldif");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);

  await doImport(personalBook.dirPrefId, ["*.ldif", "*.*"], ldifFile.path);
  checkImported(personalBook, true);
});

add_task(async function testImportVCard() {
  const vCardFile = dataDir.clone();
  vCardFile.append("import.vcf");
  await startImport();

  const nextButton = importDoc.getElementById("addrBookNextButton");

  MockFilePicker.reset();
  MockFilePicker.setFiles([vCardFile]);
  listenForFilters();
  chooseFileType("vcard");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);

  const newBookPromise = TestUtils.topicObserved("addrbook-directory-created");
  await doImport(".new", ["*.vcf", "*.*"], vCardFile.path);
  const [newBook] = await newBookPromise;
  Assert.equal(
    newBook.dirName,
    "import",
    "the new book should be named after the file"
  );
  checkImported(newBook, false);
  await promiseDirectoryRemoved(newBook.URI);
});

add_task(async function testImportSQLite() {
  const sqliteFile = dataDir.clone();
  sqliteFile.append("import.sqlite");
  await startImport();

  const nextButton = importDoc.getElementById("addrBookNextButton");

  MockFilePicker.reset();
  MockFilePicker.setFiles([sqliteFile]);
  listenForFilters();
  chooseFileType("sqlite");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);

  await doImport(personalBook.dirPrefId, ["*.sqlite", "*.*"], sqliteFile.path);
  checkImported(personalBook, true);
});

add_task(async function testImportMAB() {
  const mabFile = dataDir.clone();
  mabFile.append("import.mab");
  await startImport();

  const nextButton = importDoc.getElementById("addrBookNextButton");

  MockFilePicker.reset();
  MockFilePicker.setFiles([mabFile]);
  listenForFilters();
  chooseFileType("mab");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, importWin);

  await doImport(historyBook.dirPrefId, ["*.mab", "*.*"], mabFile.path);
  checkImported(historyBook, true);
});

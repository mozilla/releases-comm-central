/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddrBookDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/addressbook/AddrBookDataAdapter.mjs"
);
const { VCardPropertyEntry } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);

add_task(function testSanity() {
  function getColumnTexts(view) {
    const texts = [];
    for (let i = 0; i < view.rowCount; i++) {
      texts.push(view.getCellText(i, "GeneratedName"));
    }
    return texts;
  }

  for (const firstName of ["mike", "victor", "charlie", "juliet", "oscar"]) {
    personalBook.addCard(createContact(firstName, "personal"));
  }
  personalBook.addMailList(createMailingList("list1"));
  for (const firstName of ["india", "romeo", "delta"]) {
    historyBook.addCard(createContact(firstName, "history"));
  }

  // Sanity check the "All Address Books" view.

  const allView = new AddrBookDataAdapter();
  Assert.ok(!allView.directory);
  Assert.equal(allView.rowCount, 9);
  Assert.ok(!allView.sortColumn, "no initial sort");
  Assert.ok(!allView.sortDirection, "no initial sort");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "list1",
      "mike personal",
      "victor personal",
      "charlie personal",
      "juliet personal",
      "oscar personal",
      "india history",
      "romeo history",
      "delta history",
    ],
    "initial order is the creation order, except for the list"
  );
  Assert.equal(allView.getRowProperties(0), "mailing-list");

  // Check sorting works in general.

  allView.sortBy("GeneratedName", "ascending");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "charlie personal",
      "delta history",
      "india history",
      "juliet personal",
      "list1",
      "mike personal",
      "oscar personal",
      "romeo history",
      "victor personal",
    ],
    "sort by name ascending works"
  );
  allView.sortBy("GeneratedName", "descending");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "victor personal",
      "romeo history",
      "oscar personal",
      "mike personal",
      "list1",
      "juliet personal",
      "india history",
      "delta history",
      "charlie personal",
    ],
    "sort by name descending works"
  );
  allView.sortBy("addrbook", "ascending");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "romeo history",
      "india history",
      "delta history",
      "victor personal",
      "oscar personal",
      "mike personal",
      "list1",
      "juliet personal",
      "charlie personal",
    ],
    "sort by book ascending works, sort is stable"
  );
  allView.sortBy("addrbook", "descending");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "victor personal",
      "oscar personal",
      "mike personal",
      "list1",
      "juliet personal",
      "charlie personal",
      "romeo history",
      "india history",
      "delta history",
    ],
    "sort by book descending works, sort is stable"
  );
  allView.sortBy("addrbook", "descending");
  Assert.deepEqual(
    getColumnTexts(allView),
    [
      "victor personal",
      "oscar personal",
      "mike personal",
      "list1",
      "juliet personal",
      "charlie personal",
      "romeo history",
      "india history",
      "delta history",
    ],
    "sort by the existing sort changes nothing"
  );

  // Sanity check views for individual books.

  const personalView = new AddrBookDataAdapter(personalBook);
  Assert.equal(personalView.directory, personalBook);
  Assert.equal(personalView.rowCount, 6);
  Assert.ok(!personalView.sortColumn);
  Assert.ok(!personalView.sortDirection);
  Assert.deepEqual(
    getColumnTexts(personalView),
    [
      "list1",
      "mike personal",
      "victor personal",
      "charlie personal",
      "juliet personal",
      "oscar personal",
    ],
    "initial order is the creation order, except for the list"
  );
  Assert.equal(personalView.getRowProperties(0), "mailing-list");

  const historyView = new AddrBookDataAdapter(historyBook);
  Assert.equal(historyView.directory, historyBook);
  Assert.equal(historyView.rowCount, 3);
  Assert.ok(!historyView.sortColumn);
  Assert.ok(!historyView.sortDirection);
  Assert.deepEqual(
    getColumnTexts(historyView),
    ["india history", "romeo history", "delta history"],
    "initial order is the creation order"
  );

  personalBook.deleteDirectory(personalBook.childNodes[0]);
  personalBook.deleteCards(personalBook.childCards);
  historyBook.deleteCards(historyBook.childCards);
});

add_task(function testCellText() {
  const listenerTree = {
    rowCountChanged() {},
    reset() {},
  };
  const view = new AddrBookDataAdapter(personalBook);
  view.setTree(listenerTree);

  let card = createContact("Test", "Person");
  card.primaryEmail = null;
  card = personalBook.addCard(card);

  const data = [
    {
      columnId: "EmailAddresses",
      vCardName: "email",
      values: ["test.person@invalid", "tperson@work.invalid"],
      text: ["test.person@invalid", "tperson@work.invalid"],
    },
    {
      columnId: "PhoneNumbers",
      vCardName: "tel",
      values: ["(916) CALL-TURK", "0118 999 881 999 119 725 3"],
      text: ["(916) CALL-TURK", "0118 999 881 999 119 725 3"],
      // Recognise these numbers? Great taste in TV shows!
    },
    {
      columnId: "Addresses",
      vCardName: "adr",
      values: [
        [
          "",
          "",
          "1600 Pennsylvania Avenue",
          "Washington",
          "D.C.",
          "",
          "U.S.A.",
        ],
        ["", "", "10 Downing Street", "London", "", "", "U.K."],
      ],
      text: [
        "1600 Pennsylvania Avenue Washington D.C. U.S.A.",
        "10 Downing Street London U.K.",
      ],
    },
  ];

  for (const { columnId, vCardName, values, text } of data) {
    Assert.equal(view.getCellText(0, columnId), "");

    // Add an entry.
    card.vCardProperties.addValue(vCardName, values[0]);
    personalBook.modifyCard(card);
    Assert.equal(view.getCellText(0, columnId), text[0]);

    // Add another entry.
    card.vCardProperties.addValue(vCardName, values[1]);
    personalBook.modifyCard(card);
    Assert.equal(view.getCellText(0, columnId), `${text[0]}, ${text[1]}`);

    // Reprioritise the entries.
    const entries = card.vCardProperties.getAllEntries(vCardName);
    delete entries[0].params.pref;
    entries[1].params.pref = "1";
    personalBook.modifyCard(card);
    Assert.equal(view.getCellText(0, columnId), `${text[1]}, ${text[0]}`);

    // Remove an entry.
    card.vCardProperties.removeEntry(entries[0]);
    personalBook.modifyCard(card);
    Assert.equal(view.getCellText(0, columnId), text[1]);
  }

  card.vCardProperties.addValue("nickname", "The Wizard");
  card.vCardProperties.addValue("title", "Widget Inspector");
  card.vCardProperties.addValue("org", ["A.C.M.E.", "Quality Control"]);
  personalBook.modifyCard(card);

  Assert.equal(view.getCellText(0, "NickName"), "The Wizard");
  Assert.equal(view.getCellText(0, "Title"), "Widget Inspector");
  Assert.equal(view.getCellText(0, "Department"), "Quality Control");
  Assert.equal(view.getCellText(0, "Organization"), "A.C.M.E.");

  view.setTree(null);
  personalBook.deleteCards(personalBook.childCards);
});

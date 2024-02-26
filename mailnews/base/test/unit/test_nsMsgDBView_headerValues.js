/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that nsMsgDBView properly reports the values of messages in the display.
 */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var messageInjection = new MessageInjection({ mode: "local" });

// This is an array of the actual test data. Each test datum is an array of two
// elements: the first element is the argument into a simple message generator,
// and the second element is a map of column names to expected values when
// requesting the cell text for a given column name.
var tests = [
  [{ from: "John Doe <db@tinderbox.invalid>" }, { senderCol: "John Doe" }],
  [{ from: '"Doe, John" <db@tinderbox.invalid>' }, { senderCol: "Doe, John" }],
  // Multiple senders are indicated with 'et al.' suffix.
  [
    { from: "John Doe <db@tinderbox.invalid>, Sally Ann <db@null.invalid>" },
    { senderCol: "John Doe et al." },
  ],
  [
    { from: "=?UTF-8?Q?David_H=C3=A5s=C3=A4ther?= <db@null.invalid>" },
    { senderCol: "David Håsäther" },
  ],
  [
    { from: "=?UTF-8?Q?H=C3=A5s=C3=A4ther=2C_David?= <db@null.invalid>" },
    { senderCol: "Håsäther, David" },
  ],
  [
    { from: '"Håsäther, David" <db@null.invalid>' },
    { senderCol: "Håsäther, David" },
  ],
  [
    { from: "David Håsäther <db@null.invalid>" },
    { senderCol: "David Håsäther" },
  ],
  [
    {
      from: "\xC2\xAB\xCE\xA0\xCE\x9F\xCE\x9B\xCE\x99\xCE\xA4\xCE\x97\xCE\xA3\xC2\xBB",
    },
    { senderCol: "«ΠΟΛΙΤΗΣ»" },
  ],
  [
    {
      from: "John Doe \xF5  <db@null.invalid>",
      clobberHeaders: { "Content-type": "text/plain; charset=ISO-8859-1" },
    },
    { senderCol: "John Doe õ" },
  ],
  [
    {
      from: "John Doe \xF5 <db@null.invalid>",
      clobberHeaders: { "Content-type": "text/plain; charset=ISO-8859-2" },
    },
    { senderCol: "John Doe ő" },
  ],
  [
    {
      from: "=?UTF-8?Q?H=C3=A5s=C3=A4ther=2C_David?= <db@null.invalid>",
      clobberHeaders: { "Content-type": "text/plain; charset=ISO-8859-2" },
    },
    { senderCol: "Håsäther, David" },
  ],
];

add_task(async function test_nsMsgDBView_headValues() {
  // Add the messages to the folder
  const msgGenerator = new MessageGenerator();
  const genMessages = tests.map(data => msgGenerator.makeMessage(data[0]));
  const folder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders(
    [folder],
    [new SyntheticMessageSet(genMessages)]
  );

  // Make the DB view
  const dbviewContractId = "@mozilla.org/messenger/msgdbview;1?type=threaded";
  const dbView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  dbView.init(null, null, null);
  const outCount = {};
  dbView.open(
    folder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    0,
    outCount
  );

  // Did we add all the messages properly?
  const treeView = dbView.QueryInterface(Ci.nsITreeView);
  Assert.equal(treeView.rowCount, tests.length);

  // For each test, make sure that the display is correct.
  tests.forEach(function (data, i) {
    info("Checking data for " + uneval(data));
    const expected = data[1];
    for (const column in expected) {
      Assert.equal(dbView.cellTextForColumn(i, column), expected[column]);
    }
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the sender/recipient names nsMsgDBView caches in the summary file
 * always belong to the message they are stored on. Finding the insertion point
 * for a new message is a binary search which recomputes the name of every
 * header it visits, and it used to leak the name of one header into the next.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var gMessageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });

var gDBView;
var gTreeView;
var gFolder;

function makeMessage(index) {
  return gMessageGenerator.makeMessage({
    from: [`sender${index}`, `sender${index}@example.invalid`],
    to: [[`recipient${index}`, `recipient${index}@example.invalid`]],
  });
}

function bumpDisplayNameVersion() {
  Services.prefs.setIntPref(
    "mail.displayname.version",
    Services.prefs.getIntPref("mail.displayname.version", 0) + 1
  );
}

async function addMessages(messages) {
  await messageInjection.addSetsToFolders(
    [gFolder],
    [new SyntheticMessageSet(messages)]
  );
}

/**
 * Check that the given column, and the summary file property backing it, hold
 * each message's own address rather than some other message's.
 *
 * @param {string} column - "senderCol" or "recipientCol".
 * @param {string} property - The cached name property for that column.
 */
function checkColumn(column, property) {
  const version = Services.prefs.getIntPref("mail.displayname.version");
  const rowCount = gTreeView.rowCount;
  Assert.equal(
    rowCount,
    gFolder.getTotalMessages(false),
    "every message should be in the view"
  );
  for (let row = 0; row < rowCount; row++) {
    const hdr = gDBView.getMsgHdrAt(row);
    const [{ name, email }] = MailServices.headerParser.parseDecodedHeader(
      column == "senderCol" ? hdr.author : hdr.recipients
    );
    const expected = `${name} <${email}>`;
    Assert.equal(
      gDBView.cellTextForColumn(row, column),
      expected,
      `${column} of row ${row} should be the address of that message`
    );
    Assert.equal(
      hdr.getStringProperty(property),
      `${version}|${expected}`,
      `cached ${property} of row ${row} should be the address of that message`
    );
  }
}

add_setup(async function () {
  Services.prefs.setBoolPref("mail.showCondensedAddresses", false);
  Services.prefs.setIntPref("mail.addressDisplayFormat", 0);

  gFolder = await messageInjection.makeEmptyFolder();

  const messages = [];
  for (let i = 1; i <= 8; i++) {
    messages.push(makeMessage(i));
  }
  await addMessages(messages);

  gDBView = Cc[
    "@mozilla.org/messenger/msgdbview;1?type=threaded"
  ].createInstance(Ci.nsIMsgDBView);
  gDBView.init(null, null, null);
  gDBView.open(
    gFolder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    Ci.nsMsgViewFlagsType.kNone
  );

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);

  registerCleanupFunction(() => gDBView.close());
});

add_task(function test_sender_names_are_correct() {
  gDBView.sort(Ci.nsMsgViewSortType.byAuthor, Ci.nsMsgViewSortOrder.ascending);
  checkColumn("senderCol", "sender_name");
});

add_task(async function test_sender_names_after_insertion() {
  gDBView.sort(Ci.nsMsgViewSortType.byAuthor, Ci.nsMsgViewSortOrder.ascending);
  // Discard the names cached by the sort above, the way an address book change
  // does, so that the insertion below has to recompute them.
  bumpDisplayNameVersion();

  await addMessages([makeMessage(9)]);

  checkColumn("senderCol", "sender_name");
});

add_task(async function test_recipient_names_after_insertion() {
  gDBView.sort(
    Ci.nsMsgViewSortType.byRecipient,
    Ci.nsMsgViewSortOrder.ascending
  );
  bumpDisplayNameVersion();

  await addMessages([makeMessage(10)]);

  checkColumn("recipientCol", "recipient_names");
});

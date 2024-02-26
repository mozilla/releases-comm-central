/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let book, emily, felix, testFolder;

add_setup(async function () {
  book = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");

  emily = new AddrBookCard();
  emily.displayName = "This is Emily!";
  emily.primaryEmail = "emily@ekberg.invalid";
  book.addCard(emily);

  felix = new AddrBookCard();
  felix.displayName = "Felix's Flower Co.";
  felix.primaryEmail = "felix@flowers.invalid";
  felix.setPropertyAsBool("PreferDisplayName", false);
  book.addCard(felix);

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  registerCleanupFunction(async () => {
    await ensure_cards_view();
    book.deleteCards(book.childCards);
    MailServices.accounts.removeAccount(account, false);
  });

  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("preferDisplayName")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
});

add_task(async function () {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const { threadPane, threadTree, messageBrowser } = about3Pane;
  // Not `currentAboutMessage` as that's null right now.
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  // Set up the UI.

  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });
  threadPane.onColumnsVisibilityChanged({
    value: "senderCol",
    target: { hasAttribute: () => true },
  });
  threadPane.onColumnsVisibilityChanged({
    value: "recipientCol",
    target: { hasAttribute: () => true },
  });

  // Switch to classic view and table layout as the test requires this state.
  await ensure_table_view();

  // It's important that we don't cause the thread tree to invalidate the row
  // in question, and selecting it would do that, so select it first.
  threadTree.selectedIndex = 2;
  await BrowserTestUtils.browserLoaded(messagePaneBrowser);

  // Check the initial state of everything.

  let fromLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="from"]`
  );
  let fromSingleLine = fromLabel.querySelector(".recipient-single-line");
  let fromMultiLineName = fromLabel.querySelector(".recipient-multi-line-name");
  let fromMultiLineAddress = fromLabel.querySelector(
    ".recipient-multi-line-address"
  );

  let toLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="to"]`
  );
  let toSingleLine = toLabel.querySelector(".recipient-single-line");

  let row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "This is Emily!",
    "initial state of Correspondent column"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "This is Emily!",
    "initial state of Sender column"
  );
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix Flowers",
    "initial state of Recipient column"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "This is Emily!",
    "initial state of From single-line label"
  );
  Assert.equal(
    fromSingleLine.title,
    "Emily Ekberg <emily@ekberg.invalid>",
    "initial state of From single-line title"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "This is Emily!",
    "initial state of From multi-line name"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "initial state of From multi-line address"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix Flowers <felix@flowers.invalid>",
    "initial state of To single-line label"
  );
  Assert.equal(toSingleLine.title, "", "initial state of To single-line title");

  // Change Emily's display name.

  emily.displayName = "I'm Emily!";
  book.modifyCard(emily);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "I'm Emily!",
    "Correspondent column should be the new display name"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "I'm Emily!",
    "Sender column should be the new display name"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "I'm Emily!",
    "From single-line label should be the new display name"
  );
  Assert.equal(
    fromSingleLine.title,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From single-line title should not change"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "I'm Emily!",
    "From multi-line name should be the new display name"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "From multi-line address should not change"
  );

  // Stop preferring Emily's display name.

  emily.setPropertyAsBool("PreferDisplayName", false);
  book.modifyCard(emily);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "Emily Ekberg",
    "Correspondent column should be the name from the header"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "Emily Ekberg",
    "Sender column should be the name from the header"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From single-line label should match the header"
  );
  Assert.equal(
    fromSingleLine.title,
    "",
    "From single-line title should be cleared"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "Emily Ekberg",
    "From multi-line name should be the name from the header"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "From multi-line address should not change"
  );

  // Prefer Emily's display name.

  emily.setPropertyAsBool("PreferDisplayName", true);
  book.modifyCard(emily);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "I'm Emily!",
    "Correspondent column should be the display name"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "I'm Emily!",
    "Sender column should be the display name"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "I'm Emily!",
    "From single-line label should be the display name"
  );
  Assert.equal(
    fromSingleLine.title,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From single-line title should match the header"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "I'm Emily!",
    "From multi-line name should be the display name"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "From multi-line address should not change"
  );

  // Prefer Felix's display name.

  felix.setPropertyAsBool("PreferDisplayName", true);
  book.modifyCard(felix);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix's Flower Co.",
    "Recipient column should be the display name"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix's Flower Co.",
    "To single-line label should be the display name"
  );
  Assert.equal(
    toSingleLine.title,
    "Felix Flowers <felix@flowers.invalid>",
    "To single-line title should match the header"
  );

  // Stop preferring Felix's display name.

  felix.setPropertyAsBool("PreferDisplayName", false);
  book.modifyCard(felix);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix Flowers",
    "Recipient column should be the name from the header"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix Flowers <felix@flowers.invalid>",
    "To single-line label should match the header"
  );
  Assert.equal(
    toSingleLine.title,
    "",
    "To single-line title should be cleared"
  );

  // Prefer Felix's display name.

  felix.setPropertyAsBool("PreferDisplayName", true);
  book.modifyCard(felix);

  // Set global prefer display name preference to false.

  Services.prefs.setBoolPref("mail.showCondensedAddresses", false);
  await TestUtils.waitForCondition(
    () => !toLabel.parentNode,
    "Waiting for the header labels to reload."
  );
  fromLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="from"]`
  );
  toLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="to"]`
  );

  fromSingleLine = fromLabel.querySelector(".recipient-single-line");
  fromMultiLineName = fromLabel.querySelector(".recipient-multi-line-name");
  fromMultiLineAddress = fromLabel.querySelector(
    ".recipient-multi-line-address"
  );
  toSingleLine = toLabel.querySelector(".recipient-single-line");

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "Emily Ekberg",
    "Correspondent column should be the name from the header"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "Emily Ekberg",
    "Sender column should be the name from the header"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From single-line label should match the header"
  );
  Assert.equal(
    fromSingleLine.title,
    "",
    "From single-line title should be cleared"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From multi-line name should be the name from the header"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "From multi-line address should not change"
  );
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix Flowers",
    "Recipient column should be the name from the header"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix Flowers <felix@flowers.invalid>",
    "To single-line label should match the header"
  );
  Assert.equal(
    toSingleLine.title,
    "",
    "To single-line title should be cleared"
  );

  // Reset prefer display name global preference to true.

  Services.prefs.setBoolPref("mail.showCondensedAddresses", true);
  await TestUtils.waitForCondition(
    () => !toLabel.parentNode,
    "Waiting for the header labels to reload."
  );
  fromLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="from"]`
  );
  toLabel = aboutMessage.document.querySelector(
    `.header-recipient[data-header-name="to"]`
  );

  fromSingleLine = fromLabel.querySelector(".recipient-single-line");
  fromMultiLineName = fromLabel.querySelector(".recipient-multi-line-name");
  fromMultiLineAddress = fromLabel.querySelector(
    ".recipient-multi-line-address"
  );
  toSingleLine = toLabel.querySelector(".recipient-single-line");

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".correspondentcol-column").textContent,
    "I'm Emily!",
    "Correspondent column should be the new display name"
  );
  Assert.equal(
    row.querySelector(".sendercol-column").textContent,
    "I'm Emily!",
    "Sender column should be the new display name"
  );
  Assert.equal(
    fromSingleLine.textContent,
    "I'm Emily!",
    "From single-line label should be the new display name"
  );
  Assert.equal(
    fromSingleLine.title,
    "Emily Ekberg <emily@ekberg.invalid>",
    "From single-line title should not change"
  );
  Assert.equal(
    fromMultiLineName.textContent,
    "I'm Emily!",
    "From multi-line name should be the new display name"
  );
  Assert.equal(
    fromMultiLineAddress.textContent,
    "emily@ekberg.invalid",
    "From multi-line address should not change"
  );
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix's Flower Co.",
    "Recipient column should be the display name"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix's Flower Co.",
    "To single-line label should be the display name"
  );
  Assert.equal(
    toSingleLine.title,
    "Felix Flowers <felix@flowers.invalid>",
    "To single-line title should match the header"
  );

  // Restore the default for Felix.

  felix.deleteProperty("PreferDisplayName");
  book.modifyCard(felix);

  row = about3Pane.threadTree.getRowAtIndex(2);
  Assert.equal(
    row.querySelector(".recipientcol-column").textContent,
    "Felix's Flower Co.",
    "Recipient column should be the display name"
  );
  Assert.equal(
    toSingleLine.textContent,
    "Felix's Flower Co.",
    "To single-line label should be the display name"
  );
  Assert.equal(
    toSingleLine.title,
    "Felix Flowers <felix@flowers.invalid>",
    "To single-line title should match the header"
  );
});

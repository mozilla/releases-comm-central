/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

add_task(async function test_new_message_star_survives_same_folder_select() {
  const account = MailServices.accounts.createLocalMailAccount();
  registerCleanupFunction(() =>
    MailServices.accounts.removeAccount(account, false)
  );
  const root = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = root
    .createLocalSubfolder("arrivals")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = new MessageGenerator().makeMessage({
    from: ["Sender", "sender@example.invalid"],
    to: [["Recipient", "recipient@example.invalid"]],
  });

  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("mail3PaneTab", { folderURI: folder.URI });
  registerCleanupFunction(() => tabmail.closeTab(tab));
  await BrowserTestUtils.browserLoaded(tab.chromeBrowser);
  const about3Pane = tab.chromeBrowser.contentWindow;
  await about3Pane.hasDOMContentLoaded.promise;

  const hdr = folder.addMessage(message.toMessageString());
  const newFlag = Ci.nsMsgMessageFlags.New;
  hdr.orFlags(newFlag);
  folder.msgDatabase.addToNewList(hdr.messageKey);
  folder.hasNewMessages = true;

  about3Pane.folderTree.dispatchEvent(new about3Pane.CustomEvent("select"));

  await TestUtils.waitForCondition(
    () =>
      about3Pane.threadTree
        .getRowAtIndex(0)
        ?.dataset.properties?.includes("new"),
    "the thread pane should still show the message as new"
  );

  Assert.ok(hdr.flags & newFlag, "the New flag should be preserved");
  Assert.ok(
    folder.hasNewMessages,
    "the folder's new-message state should be preserved"
  );
});

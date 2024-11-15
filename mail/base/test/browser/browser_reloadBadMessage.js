/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a message with a bad storeToken is automatically reloaded and
 * stored again.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let imapFolder;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();

  const imapServer = new IMAPServer();
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  const imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await imapServer.addMessages(imapFolder, generator.makeMessages({}));

  registerCleanupFunction(async () => {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

add_task(async function () {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const messagePaneBrowser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  about3Pane.restoreState({
    folderURI: imapFolder.URI,
    messagePaneVisible: true,
  });

  await BrowserTestUtils.waitForCondition(() => {
    for (const m of imapFolder.messages) {
      if (!(m.flags & Ci.nsMsgMessageFlags.Offline)) {
        return false;
      }
    }
    return true;
  }, "waiting for message list to finish downloading");

  let mboxSize = imapFolder.filePath.fileSize;
  const messages = [...imapFolder.messages];
  Assert.equal(messages[0].storeToken, "0", "first storeToken should be 0");
  messages[0].storeToken = "1234"; // Much less than mboxSize.
  messages[1].storeToken = "12345678"; // Much greater than mboxSize.
  messages[2].storeToken = String(mboxSize - 2); // Near mboxSize, just in case.
  messages[3].storeToken = String(mboxSize + 2);

  for (let i = 0; i <= 3; i++) {
    // Load the message. Attempting to load a message with a bad storeToken
    // should cause it to be downloaded again from the server (you can verify
    // this with MOZ_LOG=IMAP:4) and written to the mbox.
    const loadedPromise = BrowserTestUtils.browserLoaded(
      messagePaneBrowser,
      false,
      url => url.endsWith(messages[i].messageKey)
    );
    about3Pane.threadTree.selectedIndex = i;
    await loadedPromise;

    Assert.stringContains(
      messagePaneBrowser.contentDocument.body.textContent,
      "Hello " + messages[i].recipients.replace(/^"(.*)".*$/, "$1"),
      "actual message content should load"
    );
    Assert.equal(
      messages[i].storeToken,
      String(mboxSize),
      "message should have been rewritten at the end of the mbox file"
    );
    Assert.greater(
      imapFolder.filePath.fileSize,
      mboxSize,
      "message should have been rewritten at the end of the mbox file"
    );
    Assert.ok(
      messages[i].flags & Ci.nsMsgMessageFlags.Offline,
      "message has regained the offline flag"
    );

    mboxSize = imapFolder.filePath.fileSize;
  }

  // Clear the selection so the I/O service doesn't complain when we remove
  // the account.
  about3Pane.threadTree.selectedIndex = -1;
});

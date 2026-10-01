/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests downloading the rest of a partially downloaded POP3 message.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const generator = new MessageGenerator();

let pop3Server, pop3Account, pop3Inbox, localAccount, localFolder;

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localFolder = localAccount.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("getMessagesPartial")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  [pop3Server] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.pop3.plain,
  ]);
  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "pop3"
  );
  pop3Account.incomingServer.port = 110;
  pop3Account.incomingServer.QueryInterface(
    Ci.nsIPop3IncomingServer
  ).headersOnly = true;
  pop3Inbox = pop3Account.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  await addLoginInfo("mailbox://test.test", "user", "password");

  pop3Server.addMessages([
    generator.makeMessage({
      body: { body: "The rest of the message." },
    }),
  ]);
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  pop3Account.incomingServer.getNewMessages(
    pop3Inbox,
    window.msgWindow,
    urlListener
  );
  await urlListener.promise;
  await promiseServerIdle(pop3Account.incomingServer);
  Assert.ok(
    [...pop3Inbox.messages][0].flags & Ci.nsMsgMessageFlags.Partial,
    "message should be partially downloaded"
  );

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(localAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

/**
 * @returns {integer} How many messages have been retrieved from the server.
 */
function retrCount() {
  return [pop3Server.server.playTransaction()]
    .flat()
    .flatMap(t => t.them)
    .filter(command => command.startsWith("RETR")).length;
}

/**
 * Displays the only message in `folder`.
 *
 * @param {nsIMsgFolder} folder
 * @returns {Document} The document of the message pane.
 */
async function displayOnlyMessage(folder) {
  about3Pane.restoreState({ folderURI: folder.URI, messagePaneVisible: true });
  about3Pane.threadTree.selectedIndex = 0;
  await messageLoadedIn(about3Pane.messageBrowser);
  return about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
    .contentDocument;
}

/**
 * A message must not be able to trigger downloading the rest of a partial
 * message by itself.
 */
add_task(async function testEmbeddedDownloadLink() {
  const partialDoc = await displayOnlyMessage(pop3Inbox);
  const link = partialDoc.querySelector("a[href*='uidl=']");
  Assert.ok(link, "partial message should have a download link");

  localFolder.addMessage(
    generator
      .makeMessage({
        body: {
          body: `<html><body><img src="${link.href}"></body></html>\n`,
          contentType: "text/html",
        },
      })
      .toMessageString()
  );
  await displayOnlyMessage(localFolder);
  await promiseServerIdle(pop3Account.incomingServer);

  Assert.equal(retrCount(), 0, "no message should be retrieved");
  Assert.ok(
    [...pop3Inbox.messages][0].flags & Ci.nsMsgMessageFlags.Partial,
    "message should still be partially downloaded"
  );
});

/**
 * A message must not be able to download the rest of a partial message using
 * a pop: URL directly.
 */
add_task(async function testEmbeddedPopURL() {
  const partialDoc = await displayOnlyMessage(pop3Inbox);
  const link = partialDoc.querySelector("a[href*='uidl=']");
  const uidl = new URL(link.href).searchParams.get("uidl");
  const src = `pop://user@test.test:110/?uidl=${uidl}&number=1&folderURI=${pop3Inbox.URI}`;

  const folder = localAccount.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("getMessagesPartialPop")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessage(
    generator
      .makeMessage({
        body: {
          body: `<html><body><img src="${src}"></body></html>\n`,
          contentType: "text/html",
        },
      })
      .toMessageString()
  );
  await displayOnlyMessage(folder);
  await promiseServerIdle(pop3Account.incomingServer);

  Assert.equal(retrCount(), 0, "no message should be retrieved");
  Assert.ok(
    [...pop3Inbox.messages][0].flags & Ci.nsMsgMessageFlags.Partial,
    "message should still be partially downloaded"
  );
});

/**
 * Clicking the link in a partial message downloads the rest of it.
 */
add_task(async function testClickDownloadLink() {
  const partialDoc = await displayOnlyMessage(pop3Inbox);
  const link = partialDoc.querySelector("a[href*='uidl=']");
  link.click();

  await TestUtils.waitForCondition(
    () =>
      [...pop3Inbox.messages].some(
        hdr => !(hdr.flags & Ci.nsMsgMessageFlags.Partial)
      ),
    "waiting for the rest of the message to be downloaded"
  );
  Assert.equal(retrCount(), 1, "the message should be retrieved");
});

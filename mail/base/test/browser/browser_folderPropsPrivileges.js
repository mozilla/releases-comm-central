/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Privileges button in the folder properties dialog of an IMAP
 * folder opens the server's account management url.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let imapServer, incomingServer, imapFolder;

add_setup(async function () {
  MockExternalProtocolService.init();
  imapServer = new IMAPServer();

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  incomingServer = imapAccount.incomingServer.QueryInterface(
    Ci.nsIImapIncomingServer
  );
  incomingServer.port = imapServer.port;
  incomingServer.username = "user";
  incomingServer.password = "password";
  imapFolder = incomingServer.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox)
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerCleanupFunction(async () => {
    await promiseServerIdle(incomingServer);
    MailServices.accounts.removeAccount(imapAccount, false);
    MockExternalProtocolService.cleanup();
  });
});

async function openFolderProps(callback) {
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/folderProps.xhtml",
    { callback }
  );
  about3Pane.displayFolder(imapFolder);
  about3Pane.goDoCommand("cmd_properties");
  await dialogPromise;
  await SimpleTest.promiseFocus(window);
}

add_task(async function testNoManageUrl() {
  incomingServer.manageMailAccountUrl = "";
  await openFolderProps(win => {
    Assert.ok(
      win.document.getElementById("imap.FolderPrivileges").hidden,
      "privileges button should be hidden without a manage url"
    );
    win.document.querySelector("dialog").getButton("cancel").click();
  });
});

add_task(async function testManageUrl() {
  incomingServer.manageMailAccountUrl = "https://example.com/manage";
  const openedLinkPromise = MockExternalProtocolService.promiseLoad();
  await openFolderProps(win => {
    const button = win.document.getElementById("imap.FolderPrivileges");
    Assert.ok(
      !button.hidden,
      "privileges button should be shown with a manage url"
    );
    button.click();
  });
  Assert.equal(
    await openedLinkPromise,
    "https://example.com/manage",
    "privileges button should open the manage url"
  );
});

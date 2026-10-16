/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const tabmail = document.getElementById("tabmail");

function loaded(tab) {
  if (tab.mode.name == "contentTab") {
    // pdf.js sets this after reading its view history from session storage.
    return !!tab.browser.contentWindow?.wrappedJSObject.PDFViewerApplication
      ?.store;
  }
  return !!tab.chromeBrowser.contentWindow?.msgLoaded;
}

add_task(async function testRestoreImapTabsOnRestart() {
  const imapServer = new IMAPServer();
  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  account.incomingServer.port = imapServer.port;
  account.incomingServer.password = "password";
  const inbox = account.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  const pdf = await IOUtils.read(getTestFilePath("files/pdfsel.pdf"));
  const generator = new MessageGenerator();
  await imapServer.addMessages(inbox, [
    generator.makeMessage({
      attachments: [
        {
          body: btoa(String.fromCharCode(...pdf)),
          contentType: "application/pdf",
          encoding: "base64",
          filename: "attachment.pdf",
        },
      ],
    }),
    ...generator.makeMessages({ count: 10 }),
  ]);
  const [pdfMessage, ...messages] = [...inbox.messages];

  // The tabs as session.json stores them.
  const session = {
    tabs: [
      {
        mode: "contentTab",
        state: {
          tabURI: `imap://user@localhost:${imapServer.port}/fetch%3EUID%3E/INBOX%3E${pdfMessage.messageKey}?part=1.2&type=application/pdf&filename=attachment.pdf`,
        },
      },
      ...messages.map(message => ({
        mode: "mailMessageTab",
        state: { messageURI: inbox.getUriForMsg(message) },
      })),
    ],
  };

  // As after a restart: no IMAP connection and nothing in the memory cache.
  account.incomingServer.closeCachedConnections();
  Services.cache2.clear();

  tabmail.restoreTabs(session);
  await TestUtils.waitForCondition(
    () => tabmail.tabInfo.slice(1).every(loaded),
    "the restored tabs should load"
  );
  Assert.equal(tabmail.tabInfo.length, 1 + session.tabs.length);

  for (const tab of tabmail.tabInfo.slice(1)) {
    tabmail.closeTab(tab);
  }

  await promiseServerIdle(account.incomingServer);
  MailServices.accounts.removeAccount(account, false);
});

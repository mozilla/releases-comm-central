/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 *  Test for the most suitable identity in From address for reply-to-list
 */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { close_compose_window, open_compose_with_reply_to_list } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { assert_selected_and_displayed, be_in_folder, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);

var gServer;
var testFolder = null;
var replyToListWindow = null;

var identityString1 = "tinderbox_correct_identity@foo.invalid";

/** Setup the daemon and server. */
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function (d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  return new nsMailServer(handler, new SmtpDaemon());
}

function makeBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    "smtp",
    "user",
    "password",
    { port, hostname }
  );

  // Override the default greeting so we get something predictable
  // in the ELHO message
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");
  return server;
}

add_setup(function () {
  gServer = setupServerDaemon();
  gServer.start();

  const identity = MailServices.accounts.createIdentity();
  identity.email = identityString1;
  identity.smtpServerKey = makeBasicSmtpServer(gServer.port).key;

  const identity2 = MailServices.accounts.createIdentity();
  identity2.email = "tinderbox_identity1@foo.invalid";

  const server = MailServices.accounts.createIncomingServer(
    "nobody",
    "TestLocalFolders",
    "pop3"
  );
  const localRoot = server.rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder = localRoot.createLocalSubfolder("Test Folder");

  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  account.addIdentity(identity2);

  addMessageToFolder(testFolder);
  Services.prefs.setBoolPref("mailnews.show_send_progress", false);

  registerCleanupFunction(() => {
    gServer.stop();
    MailServices.accounts.removeAccount(account, true);
    Services.prefs.clearUserPref("mailnews.show_send_progress");
  });
});

function addMessageToFolder(aFolder) {
  var msgId = Services.uuid.generateUUID() + "@mozillamessaging.invalid";

  var source =
    "X-Mozilla-Status: 0001\n" +
    "X-Mozilla-Status2: 00000000\n" +
    "Delivered-To: <tinderbox_identity333@foo.invalid>\n" +
    "Delivered-To: <" +
    identityString1 +
    ">\n" +
    "Delivered-To: <tinderbox_identity555@foo.invalid>\n" +
    "Message-ID: <" +
    msgId +
    ">\n" +
    "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
    "From: Tester <tests@mozillamessaging.invalid>\n" +
    "User-Agent: Thunderbird 3.0a2pre (Macintosh/2008052122)\n" +
    "MIME-Version: 1.0\n" +
    "List-ID: <list.mozillamessaging.invalid>\n" +
    "List-Post: <list.mozillamessaging.invalid>, \n" +
    "    <mailto: list@mozillamessaging.invalid>\n" +
    "To: recipient@mozillamessaging.invalid\n" +
    "Subject: a subject\n" +
    "Content-Type: text/html; charset=ISO-8859-1\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\ntext body\n";

  aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  aFolder.gettingNewMessages = true;
  aFolder.addMessage(source);
  aFolder.gettingNewMessages = false;

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

add_task(async function test_Reply_To_List_From_Address() {
  await be_in_folder(testFolder);

  const curMessage = await select_click_row(0);
  await assert_selected_and_displayed(window, curMessage);

  replyToListWindow = await open_compose_with_reply_to_list();

  const identityList = replyToListWindow.document.getElementById("msgIdentity");

  Assert.ok(
    identityList.selectedItem.label.includes(identityString1),
    `${identityList.selectedItem.label} should contain ${identityString1}`
  );

  // Do a real send, as that's the only time address collection occurs.
  const aftersend = BrowserTestUtils.waitForEvent(
    replyToListWindow,
    "aftersend"
  );
  replyToListWindow.goDoCommand("cmd_sendNow");
  await aftersend;

  // Check the name was blanked out for the collected list address,
  // since it may be, or contain, the name of a list poster.
  const book = MailServices.ab.directories.find(d =>
    d.cardForEmailAddress("list@mozillamessaging.invalid")
  );
  const card = book.cardForEmailAddress("list@mozillamessaging.invalid");
  Assert.equal(card.displayName, "", "Should not collect list display name");
  book.deleteCards([card]);

  await close_compose_window(replyToListWindow);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 *  Test for the most suitable identity in From address for reply-to-list
 */

"use strict";

var { close_compose_window, open_compose_with_reply_to_list } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { assert_selected_and_displayed, be_in_folder, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var testFolder = null;
var replyToListWindow = null;

var identityString1 = "tinderbox_correct_identity@foo.invalid";

add_setup(function () {
  addIdentitiesAndFolder();
  addMessageToFolder(testFolder);
});

function addMessageToFolder(aFolder) {
  var msgId = Services.uuid.generateUUID() + "@mozillamessaging.invalid";

  var source =
    "From - Sat Nov  1 12:39:54 2008\n" +
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

function addIdentitiesAndFolder() {
  const identity2 = MailServices.accounts.createIdentity();
  // identity.fullName = "Tinderbox_Identity1";
  identity2.email = "tinderbox_identity1@foo.invalid";

  const identity = MailServices.accounts.createIdentity();
  // identity.fullName = "Tinderbox_Identity1";
  identity.email = identityString1;

  const server = MailServices.accounts.createIncomingServer(
    "nobody",
    "Test Local Folders",
    "pop3"
  );
  const localRoot = server.rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder = localRoot.createLocalSubfolder("Test Folder");

  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  account.addIdentity(identity2);
}

add_task(async function test_Reply_To_List_From_Address() {
  await be_in_folder(testFolder);

  const curMessage = await select_click_row(0);
  await assert_selected_and_displayed(window, curMessage);

  replyToListWindow = await open_compose_with_reply_to_list();

  var identityList = replyToListWindow.document.getElementById("msgIdentity");

  // see if it's the correct identity selected
  if (!identityList.selectedItem.label.includes(identityString1)) {
    throw new Error(
      "The From address is not correctly selected! Expected: " +
        identityString1 +
        "; Actual: " +
        identityList.selectedItem.label
    );
  }

  await close_compose_window(replyToListWindow);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

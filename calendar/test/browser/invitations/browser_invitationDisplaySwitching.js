/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the invitation display is hidden when appropriate.
 */
"use strict";

var {
  add_message_sets_to_folders,
  be_in_folder,
  create_folder,
  create_thread,
  open_folder_in_new_tab,
  close_tab,
  wait_for_message_display_completion,
  inboxFolder,
  select_click_row,
} = ChromeUtils.import("resource://testing-common/mozmill/FolderDisplayHelpers.jsm");

let folderA;
let folderB;

/**
 * Copied from mail/components/extensions/test/browser/head.js. Allows an .eml
 * file to be added to a folder.
 */
async function createMessageFromFile(folder, path) {
  let message = await IOUtils.readUTF8(path);
  // A cheap hack to make this acceptable to addMessageBatch. It works for
  // existing uses but may not work for future uses.
  let fromChunks = message.match(/From: .* <(.*@.*)>/);
  if (fromChunks) {
    let fromAddress = fromChunks[0];
    message = `From ${fromAddress}\r\n${message}`;
  }
  folder.addMessageBatch([message]);
  folder.callFilterPlugins(null);
}

/**
 * Initialize the folders used for testing.
 */
add_setup(async function() {
  let identity = MailServices.accounts.createIdentity();
  identity.email = "receiver@example.com";
  identity.valid = true;

  let account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );
  account.addIdentity(identity);

  folderA = await create_folder("Folder A");
  folderB = await create_folder("Folder B");
  Services.prefs.setBoolPref("calendar.itip.newInvitationDisplay", true);
  registerCleanupFunction(async () => {
    be_in_folder(inboxFolder);
    let trash = folderA.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folderA.deleteSelf(null);
    folderB.deleteSelf(null);
    trash.emptyTrash(null, null);
    MailServices.accounts.removeAccount(account);
    Services.prefs.setBoolPref("calendar.itip.newInvitationDisplay", false);
  });
});

/**
 * Tests the invitation display is correctly hidden when switching between
 * folders or to a tab.
 */
add_task(async function testInvitationDisplaySwitching() {
  let display = document.getElementById("calendarInvitationDisplay");
  be_in_folder(folderA);
  await add_message_sets_to_folders([folderA], [create_thread(1)]);
  await createMessageFromFile(folderA, getTestFilePath("../invitations/data/single-event.eml"));
  await createMessageFromFile(folderA, getTestFilePath("../invitations/data/update-minor.eml"));

  info("Ensuring invitation display is initially hidden.");
  select_click_row(0);
  Assert.ok(display.hidden, "invitation display is hidden");

  info("Ensuring invitation display is shown when a message with an invitation is selected");
  select_click_row(1);
  Assert.ok(!display.hidden, "invitation display is not hidden");

  let panel = document.querySelector("calendar-invitation-panel");
  let minidate = panel.shadowRoot.querySelector("calendar-minidate");
  Assert.equal(minidate.fullDate, "Mar 16 2022");
  let header = panel.shadowRoot.querySelector("calendar-invitation-panel-header");
  Assert.equal(header.fullTitle, "Sender has invited you to: Single Event");

  info("Ensuring invitation display is hidden when switching folders.");
  be_in_folder(folderB);
  Assert.ok(display.hidden, "invitation display is hidden when switching folders");

  info("Ensuring invitation display is hidden when opening a folder in a new tab.");
  be_in_folder(folderA);
  select_click_row(1);
  Assert.ok(!display.hidden);
  open_folder_in_new_tab(folderB);
  wait_for_message_display_completion(null);
  Assert.ok(display.hidden, "invitation display is hidden when viewing a new tab");
  close_tab(1);
});

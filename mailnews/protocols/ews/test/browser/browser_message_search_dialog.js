/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var ewsServer;
var incomingServer;

add_setup(async function () {
  [ewsServer, incomingServer] = setupEwsTestServer();
  incomingServer.prettyName = "EWS Account";
});

/**
 * Tests that EWS accounts show up in the "Message Search" dialog's folder
 * picker. What folders show up in there is defined at the server level (via
 * `nsIMsgIncomingServer::GetCanSearchMessages`) so if the server is shown, we
 * can assume its folders will be there as well.
 */
add_task(async function test_account_appears_in_search() {
  // Sync the account folder, otherwise it won't be listed in the search dialog.
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  // Open the search dialog.
  const searchPromise = promise_new_window("mailnews:search");
  EventUtils.synthesizeKey("F", { shiftKey: true, accelKey: true }, window);
  const searchDialog = await searchPromise;

  // Make sure the EWS account appears in the folder drop-down.
  let items = searchDialog.document.querySelectorAll("#searchableFolders menu");
  items = Array.from(items).filter(
    item => item.label == incomingServer.prettyName
  );
  Assert.equal(items.length, 1, "there should be one EWS account available");

  // Now close the search window
  const closePromise = BrowserTestUtils.domWindowClosed(searchDialog);
  EventUtils.synthesizeKey("VK_ESCAPE", {}, searchDialog);
  await closePromise;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane } = about3Pane;

let account;
let rootFolder;

add_setup(function () {
  account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  registerCleanupFunction(() => {
    folderPane.activeModes = ["all"];
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * A folder can be announced while temporarily detached during a move. Smart
 * folders mode should wait for the later, attached announcement.
 */
add_task(function test_smartModeIgnoresDetachedFolder() {
  folderPane.activeModes = ["all", "smart"];
  const detachedFolder = rootFolder.createLocalSubfolder(
    "temporarily detached"
  );
  detachedFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const childFolder = detachedFolder.createLocalSubfolder("child");
  const smartMode = folderPane._modes.smart;

  smartMode.removeFolder(rootFolder, detachedFolder);
  detachedFolder.parent = null;

  smartMode.addFolder(rootFolder, detachedFolder);
  Assert.equal(
    folderPane.getRowForFolder(detachedFolder, "smart"),
    null,
    "a detached folder should not be added to smart folders mode"
  );
  Assert.equal(
    folderPane.getRowForFolder(childFolder, "smart"),
    null,
    "a child of a detached folder should not be added to smart folders mode"
  );

  detachedFolder.parent = rootFolder;
  smartMode.addFolder(rootFolder, detachedFolder);
  const folderRow = folderPane.getRowForFolder(detachedFolder, "smart");
  const childRow = folderPane.getRowForFolder(childFolder, "smart");
  Assert.ok(
    folderRow,
    "the attached folder should be added by a later announcement"
  );
  Assert.ok(
    childRow,
    "the child folder should be added by a later announcement"
  );
  Assert.equal(
    childRow.parentNode,
    folderRow.childList,
    "the child folder should be nested under the attached folder"
  );

  rootFolder.propagateDelete(detachedFolder, true);
});

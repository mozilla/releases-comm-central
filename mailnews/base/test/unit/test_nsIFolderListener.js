/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that adding nsIFolderListener in js does not cause any crash.
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var folderListener = {
  onFolderAdded() {},
  onMessageAdded() {},
  onFolderRemoved() {},
  onMessageRemoved() {},
  onFolderPropertyChanged() {},
  onFolderIntPropertyChanged() {},
  onFolderBoolPropertyChanged() {},
  onFolderUnicharPropertyChanged() {},
  onFolderPropertyFlagChanged() {},
  onFolderEvent() {},
};

var targetFolder;
var messageInjection;

add_setup(async function () {
  const msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);

  targetFolder = await messageInjection.makeEmptyFolder();
  targetFolder.AddFolderListener(folderListener);
  registerCleanupFunction(function () {
    targetFolder.RemoveFolderListener(folderListener);
  });
});

add_task(async function create_new_message() {
  await messageInjection.makeNewSetsInFolders([targetFolder], [{ count: 1 }]);
});

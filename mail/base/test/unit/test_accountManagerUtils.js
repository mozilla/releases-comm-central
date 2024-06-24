/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Folder tree properties needs the profile already
do_get_profile();

const { AccountManagerUtils } = ChromeUtils.importESModule(
  "resource:///modules/AccountManagerUtils.sys.mjs"
);
const { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const folderURI = "example://folder";
// Mock nsIMsgAccount
const account = {
  incomingServer: {
    rootFolder: {
      URI: folderURI,
    },
  },
};

/**
 *
 * @param {nsISupports} subject
 * @returns {boolean}
 */
function isSubjectAccount(subject) {
  return subject.wrappedJSObject === account;
}

add_setup(async () => {
  await FolderTreeProperties.ready;
});
registerCleanupFunction(() => {
  FolderTreeProperties.resetColors();
});

add_task(async function test_defaultColor() {
  const amu = new AccountManagerUtils(account);

  Assert.equal(
    typeof amu.defaultServerColor,
    "string",
    "Default color is a string"
  );
  Assert.greater(
    amu.defaultServerColor.length,
    0,
    "Default server color is not an empty string"
  );
  Assert.equal(
    amu.serverColor,
    amu.defaultServerColor,
    "Should get default color"
  );
});

add_task(async function test_previewServerColor() {
  const amu = new AccountManagerUtils(account);

  const previewObserver = TestUtils.topicObserved(
    "server-color-preview",
    isSubjectAccount
  );
  amu.previewServerColor("#ffbbff");
  const [, data] = await previewObserver;
  Assert.equal(data, "#ffbbff", "Should receive preview color");
});

add_task(async function test_updateServerColorToDefault() {
  const amu = new AccountManagerUtils(account);

  const updatedObserver = TestUtils.topicObserved(
    "server-color-changed",
    isSubjectAccount
  );
  amu.updateServerColor(amu.defaultServerColor.toUpperCase());
  const [, data] = await updatedObserver;
  Assert.equal(
    data,
    undefined,
    "Should get undefined when setting to default color"
  );
  Assert.equal(
    amu.serverColor,
    amu.defaultServerColor,
    "Server color should match the default value"
  );
});

add_task(async function test_updateAndResetServerColor() {
  const amu = new AccountManagerUtils(account);

  const updatedObserver = TestUtils.topicObserved(
    "server-color-changed",
    isSubjectAccount
  );
  amu.updateServerColor("#bbffbb");
  const [, data] = await updatedObserver;
  Assert.equal(data, "#bbffbb", "Should receive new color");
  Assert.equal(
    amu.serverColor,
    "#bbffbb",
    "serverColor property should have new color"
  );

  const resetObserver = TestUtils.topicObserved(
    "server-color-changed",
    isSubjectAccount
  );
  amu.resetServerColor();
  const [, resetData] = await resetObserver;
  Assert.equal(resetData, undefined, "Observed color reset");
  Assert.equal(
    amu.serverColor,
    amu.defaultServerColor,
    "Should get default color for server"
  );
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that we handle the RFC2197 ID command.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var kIDResponse =
  '("name" "GImap" "vendor" "Google, Inc." "support-url" "http://mail.google.com/support")';

add_setup(async function () {
  setupIMAPPump("GMail");
  IMAPPump.daemon.idResponse = kIDResponse;

  // update folder to kick start tests.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(async function updateInbox() {
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(function checkIDHandling() {
  Assert.equal(IMAPPump.daemon.clientID, '("name" "xpcshell" "version" "1")');
  Assert.equal(IMAPPump.incomingServer.serverIDPref, kIDResponse);
});

add_task(teardownIMAPPump);

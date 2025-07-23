/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * Sync the messages for the specified folder.
 *
 * @param {nsIMsgIncomingServer} incomingServer
 * @param {nsIMsgFolder} folder
 */
async function syncFolder(incomingServer, folder) {
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(folder, null, asyncUrlListener);
  return asyncUrlListener.promise;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

const daemon = setupNNTPDaemon();
const server = makeServer(NNTP_RFC4643_extension, daemon);
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Test connection should be closed after canceling the password dialog.
 */
add_task(async function cancelPasswordDialog() {
  // Mock the password prompt.
  registerAlertTestUtils();

  // Enforce server auth and trigger a list group request.
  const incomingServer = setupLocalServer(server.port);
  incomingServer.pushAuth = true;
  const listener = new PromiseTestUtils.PromiseStreamListener();
  incomingServer.loadNewsUrl(
    Services.io.newURI(`news://localhost:${server.port}/*`),
    null,
    listener
  );

  // The request should be aborted.
  try {
    await listener.promise;
  } catch (e) {
    equal(e, Cr.NS_ERROR_ABORT);
  }

  // Should send nothing after canceling the password dialog.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, ["MODE READER"]);
});

function promptUsernameAndPasswordPS(
  aParent,
  aDialogTitle,
  aText,
  aUsername,
  aPassword,
  aCheckMsg,
  aCheckState
) {
  // Cancel the password dialog.
  return false;
}

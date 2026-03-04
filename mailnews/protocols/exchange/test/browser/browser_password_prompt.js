/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var ewsServer;
var incomingServer;

add_setup(async function () {
  [ewsServer, incomingServer] = setupEwsTestServer();
});

/**
 * Tests that the current operation is aborted if the user cancels a password
 * prompt.
 */
add_task(async function test_password_prompt_cancel() {
  // Clear and forget all credentials for the server, so we start with an empty
  // password and we get prompted for a password right away.
  Services.logins.removeAllLogins();
  incomingServer.forgetPassword();

  const promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");

  // Sync the folder without waiting on it. If we waited for the sync to
  // complete, we'd also wait for the prompt to close, meaning we'd essentially
  // be in a deadlock.
  //
  // Instead, we fire-and-forget the folder sync and wait for 1) the prompt to
  // appear and close, and 2) the client becoming idle.
  syncFolder(incomingServer, incomingServer.rootFolder);
  await promptPromise;

  // Check if the client is idle, which means the operation has been fully
  // aborted.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer);
  await TestUtils.waitForCondition(
    () => incomingServer.protocolClientIdle,
    "the EWS client should eventually become idle"
  );

  // We already know the client is idle, but the test will fail if it doesn't
  // have any assertion.
  Assert.ok(incomingServer.protocolClientIdle);
});

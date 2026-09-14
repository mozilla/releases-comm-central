/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(function testOfflineGetMail() {
  const incomingServer = createPop3ServerAndLocalFolders(65535);
  const inbox = incomingServer.rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  const urlListener = {
    OnStartRunningUrl() {},
    OnStopRunningUrl() {},
  };

  const manageOfflineStatus = Services.io.manageOfflineStatus;
  const offline = Services.io.offline;
  registerCleanupFunction(() => {
    Services.io.manageOfflineStatus = manageOfflineStatus;
    Services.io.offline = offline;
  });
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;

  for (const method of ["GetNewMail", "CheckForNewMail"]) {
    Assert.throws(
      () => MailServices.pop3[method](null, urlListener, inbox, incomingServer),
      error => error.result == Cr.NS_MSG_ERROR_OFFLINE,
      `${method} should fail without creating a client while offline`
    );
    Assert.ok(
      !incomingServer.wrappedJSObject.runningClient,
      `${method} should not create a POP3 client while offline`
    );
  }

  Assert.throws(
    () => incomingServer.performBiff(null),
    error => error.result == Cr.NS_MSG_ERROR_OFFLINE,
    "performBiff should fail while offline"
  );
  Assert.ok(
    !incomingServer.performingBiff,
    "performBiff should reset its state after failing"
  );
});

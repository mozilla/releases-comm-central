/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(function testOfflineGetNews() {
  const incomingServer = setupLocalServer(65535);
  const folder = incomingServer.rootFolder.getChildNamed("test.filter");

  const manageOfflineStatus = Services.io.manageOfflineStatus;
  const offline = Services.io.offline;
  registerCleanupFunction(() => {
    Services.io.manageOfflineStatus = manageOfflineStatus;
    Services.io.offline = offline;
  });
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;

  Assert.throws(
    () => folder.getNewMessages(null, null),
    error => error.result == Cr.NS_MSG_ERROR_OFFLINE,
    "getting news directly should fail while offline"
  );

  incomingServer.performBiff(null);
  Assert.deepEqual(
    incomingServer.wrappedJSObject._busyConnections,
    [],
    "biff should not create a busy NNTP connection while offline"
  );
  Assert.deepEqual(
    incomingServer.wrappedJSObject._idleConnections,
    [],
    "biff should not create an idle NNTP connection while offline"
  );
});

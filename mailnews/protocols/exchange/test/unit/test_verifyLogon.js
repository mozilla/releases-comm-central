/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { GraphServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/GraphServer.sys.mjs"
);

var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

/**
 * @type {nsIMsgWindow}
 */
var msgWindow;

var incomingEwsServer;
var incomingGraphServer;

/**
 * @type {EwsServer}
 */
var ewsServer;

/**
 * @type {GraphServer}
 */
var graphServer;

add_setup(async function () {
  [ewsServer, incomingEwsServer] = setupBasicEwsTestServer({});
  [graphServer, incomingGraphServer] = setupBasicGraphTestServer();
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
});

/**
 * Test the verify logon function for the given server pair.
 *
 * @param {MockServer} _mockServer
 * @param {nsIMsgIncomingServer} incomingServer
 */
async function test_verifyLogon(_mockServer, incomingServer) {
  const listener = new PromiseTestUtils.PromiseUrlListener();

  incomingServer.verifyLogon(listener, msgWindow);

  await listener.promise;
}

add_task(async () => test_verifyLogon(ewsServer, incomingEwsServer));
add_task(async () => test_verifyLogon(graphServer, incomingGraphServer));

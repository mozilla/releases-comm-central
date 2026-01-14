/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { GraphServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/GraphServer.sys.mjs"
);

/**
 * @type {nsIMsgWindow}
 */
var msgWindow;

var incomingServer;

/**
 * @type {GraphServer}
 */
var graphServer;

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
});

add_task(async function test_verifyLogon() {
  const listener = new PromiseTestUtils.PromiseUrlListener();

  incomingServer.verifyLogon(listener, msgWindow);

  await listener.promise;
});

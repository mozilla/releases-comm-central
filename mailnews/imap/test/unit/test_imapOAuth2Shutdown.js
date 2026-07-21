/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const oauth2Connect = Promise.withResolvers();
const oauth2Module = {
  QueryInterface: ChromeUtils.generateQI(["msgIOAuth2Module"]),

  initFromMail() {
    return true;
  },

  connect(withUI, listener) {
    Assert.ok(withUI, "OAuth2 authentication allows prompting");
    Assert.ok(listener, "OAuth2 authentication has a result listener");
    oauth2Connect.resolve();
  },
};

add_task(async function test_shutdown_during_oauth2_connect() {
  MockRegistrar.register("@mozilla.org/mail/oauth2-module;1", oauth2Module);

  const daemon = new ImapDaemon();
  const server = makeServer(daemon, "", {
    kAuthSchemes: ["XOAUTH2"],
  });
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    server.stop();
  });

  const listener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.verifyLogon(listener, null);
  await oauth2Connect.promise;

  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );
  await Assert.rejects(
    listener.promise,
    error => Number(error.message) == Cr.NS_ERROR_FAILURE,
    "the pending IMAP URL should stop with NS_ERROR_FAILURE during shutdown"
  );
});

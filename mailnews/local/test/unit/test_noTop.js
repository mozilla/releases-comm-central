/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * A handler with no TOP support.
 */
class NoTopHandler extends POP3_RFC1939_handler {
  TOP() {
    return this.onError("TOP");
  }
}

const daemon = new Pop3Daemon();
const server = new nsMailServer(d => {
  const handler = new NoTopHandler(d);
  return handler;
}, daemon);
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Inject a message to the server and do a GetNewMail for the incomingServer.
 *
 * @param {nsIPop3IncomingServer} incomingServer
 */
async function getNewMail(incomingServer) {
  daemon.setMessages(["message1.eml"]);

  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  return urlListener.promise;
}

/**
 * Test TOP is sent even if not advertised, and fallback to RETR after failed.
 */
add_task(async function testNoTop() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.headersOnly = true;
  await getNewMail(incomingServer);
  do_check_transaction(server.playTransaction(), [
    "CAPA",
    "USER fred",
    "PASS wilma",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 0",
    "RETR 1",
    "DELE 1",
  ]);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/**
 * A handler with no UIDL support.
 */
class NoUidlHandler extends POP3_RFC1939_handler {
  UIDL() {
    return this.onError("UIDL");
  }
}

let daemon = new Pop3Daemon();
let server = new nsMailServer(d => {
  let handler = new NoUidlHandler(d);
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

  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  // Now get the mail.
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  return urlListener.promise;
}

/**
 * Test that RETR and DELE are correctly sent even if UIDL is not supported.
 */
add_task(async function testNoUidl() {
  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  await getNewMail(incomingServer);
  do_check_transaction(server.playTransaction(), [
    "CAPA",
    "USER fred",
    "PASS wilma",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1",
    "DELE 1",
  ]);
});

/**
 * Test that connection is aborted if trying to use headersOnly when UIDL is
 * unsupported.
 */
add_task(async function testNoUidlHeadersOnly() {
  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.headersOnly = true;
  await Assert.rejects(
    getNewMail(incomingServer),
    e => e == Cr.NS_ERROR_FAILURE
  );
});

/**
 * Test that connection is aborted if trying to use leaveMessagesOnServer when
 * UIDL is unsupported.
 */
add_task(async function testNoUidlLeaveMessagesOnServer() {
  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.leaveMessagesOnServer = true;
  await Assert.rejects(
    getNewMail(incomingServer),
    e => e == Cr.NS_ERROR_FAILURE
  );
});

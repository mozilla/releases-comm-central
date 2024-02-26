/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const [daemon, server, handler] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

const incomingServer = createPop3ServerAndLocalFolders(server.port);

/**
 * Inject a message to the server and do a GetNewMail for the incomingServer.
 */
async function getNewMail() {
  daemon.setMessages(["message1.eml", "message3.eml"]);
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
 * Test DeleteFromPop3Server filter should send DELE for matched message.
 */
add_task(async function testDeleteFromPop3Server() {
  // Turn on leaveMessagesOnServer, so that DELE would not be sent normally.
  incomingServer.leaveMessagesOnServer = true;

  // Create a DeleteFromPop3Server filter.
  const filterList = incomingServer.getFilterList(null);
  const filter = filterList.createFilter("deleteFromServer");

  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Subject;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  const value = searchTerm.value;
  value.str = "mail 2";
  searchTerm.value = value;
  filter.appendTerm(searchTerm);

  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.DeleteFromPop3Server;
  filter.appendAction(action);

  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  await getNewMail();
  do_check_transaction(server.playTransaction(), [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1", // message1.eml doesn't match the filter, no DELE.
    "RETR 2",
    "DELE 2", // message3.eml matches the filter, DELE was sent.
  ]);

  // MailServices.accounts.removeIncomingServer(incomingServer, false);
  filterList.removeFilterAt(0);
});

/**
 * Test FetchBodyFromPop3Server filter should send RETR for matched message.
 */
add_task(async function testFetchBodyFromPop3Server() {
  incomingServer.leaveMessagesOnServer = true;
  // Turn on leaveMessagesOnServer, so that RETR would not be sent normally.
  incomingServer.headersOnly = true;

  // Create a FetchBodyFromPop3Server filter.
  const filterList = incomingServer.getFilterList(null);
  const filter = filterList.createFilter("fetchBodyFromServer");

  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Subject;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  const value = searchTerm.value;
  value.str = "mail 2";
  searchTerm.value = value;
  filter.appendTerm(searchTerm);

  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.FetchBodyFromPop3Server;
  filter.appendAction(action);

  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  await getNewMail();
  do_check_transaction(server.playTransaction(), [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 0", // message1.eml doesn't match the filter, no RETR.
    "TOP 2 0",
    "RETR 2", // message3.eml matches the filter, RETR was sent.
  ]);

  filterList.removeFilterAt(0);
});

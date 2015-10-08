/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of chaining of search scopes in a search session. In particular,
//  Bug 541969 made us not search an imap folder if the search scope before it
// there was an empty local folder.

// main test

load("../../../resources/messageGenerator.js");

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://testing-common/mailnews/IMAPpump.js");
Components.utils.import("resource://testing-common/mailnews/imapd.js");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

function *setupFolder()
{
  // add a single message to the imap inbox.
  let messages = [];
  let messageGenerator = new MessageGenerator();
  messages = messages.concat(messageGenerator.makeMessage());
  let synthMessage = messages[0];

  let msgURI =
    Services.io.newURI("data:text/plain;base64," +
                       btoa(synthMessage.toMessageString()),
                       null, null);
  let message = new imapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);

  // update folder to download header.
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  yield listener.promise;
}

function *searchTest()
{
  // Get the IMAP inbox...
  var emptyLocal1 = localAccountUtils.rootFolder.createLocalSubfolder("empty 1");

  let searchSession = Cc["@mozilla.org/messenger/searchSession;1"]
                        .createInstance(Ci.nsIMsgSearchSession);

  let searchTerm = searchSession.createTerm();
  searchTerm.matchAll = true;
  searchSession.appendTerm(searchTerm);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, emptyLocal1);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.onlineMail, IMAPPump.inbox);
  let listener = new PromiseTestUtils.PromiseSearchNotify(
                       searchSession, searchListener);
  searchSession.search(null);
  yield listener.promise;

  // After the search completes, there still seem to be active URLs, so we
  //   have to wait before we are done and clear.
  yield PromiseTestUtils.promiseDelay(1000);
}

// nsIMsgSearchNotify implementation
var searchListener =
{
  numTotalMessages: 0,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgSearchNotify]),
  onNewSearch: function() 
  {
    this.numTotalMessages = 0;
  },
  onSearchHit: function(dbHdr, folder)
  {
    this.numTotalMessages++;
  },
  onSearchDone: function(status)
  { 
    Assert.equal(this.numTotalMessages, 1);
    return true;
  }
};

var tests = [
  setupIMAPPump,
  setupFolder,
  searchTest,
  teardownIMAPPump
];

function run_test() {
  tests.forEach(add_task);
  run_next_test();
}

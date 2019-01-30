/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of chaining of search scopes in a search session. In particular,
//  Bug 541969 made us not search an imap folder if the search scope before it
// there was an empty local folder.

// main test

load("../../../resources/messageGenerator.js");

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {
  IMAPPump,
  setupIMAPPump,
  teardownIMAPPump,
} = ChromeUtils.import("resource://testing-common/mailnews/IMAPpump.js");
var {
  imapDaemon,
  imapMailbox,
  imapMessage,
  IMAP_RFC3501_handler,
  configurations,
  mixinExtension,
  IMAP_GMAIL_extension,
  IMAP_MOVE_extension,
  IMAP_CUSTOM_extension,
  IMAP_RFC2197_extension,
  IMAP_RFC2342_extension,
  IMAP_RFC3348_extension,
  IMAP_RFC4315_extension,
  IMAP_RFC5258_extension,
  IMAP_RFC2195_extension,
} = ChromeUtils.import("resource://testing-common/mailnews/imapd.js");
const {PromiseTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

async function setupFolder()
{
  // add a single message to the imap inbox.
  let messages = [];
  let messageGenerator = new MessageGenerator();
  messages = messages.concat(messageGenerator.makeMessage());
  let synthMessage = messages[0];

  let msgURI =
    Services.io.newURI("data:text/plain;base64," +
                       btoa(synthMessage.toMessageString()));
  let message = new imapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);

  // update folder to download header.
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
}

async function searchTest()
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
  await listener.promise;

  // After the search completes, there still seem to be active URLs, so we
  //   have to wait before we are done and clear.
  await PromiseTestUtils.promiseDelay(1000);
}

// nsIMsgSearchNotify implementation
var searchListener =
{
  numTotalMessages: 0,
  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgSearchNotify]),
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
  tests.forEach(x => add_task(x));
  run_next_test();
}

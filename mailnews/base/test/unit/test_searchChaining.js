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

function run_test()
{
  setupIMAPPump("");
  // add a single message to the imap inbox.
  let messages = [];
  let gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  gSynthMessage = messages[0];

  let msgURI =
    Services.io.newURI("data:text/plain;base64," +
                       btoa(gSynthMessage.toMessageString()),
                       null, null);
  gMessage = new imapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(gMessage);

  // update folder to download header.
  IMAPPump.inbox.updateFolderWithListener(null, UrlListener);
  do_test_pending();
}

var UrlListener = 
{
  OnStartRunningUrl: function(url) { },
  OnStopRunningUrl: function(url, rc)
  {
    // Check for ok status.
    do_check_eq(rc, 0);
    searchTest();
  }
};

function searchTest()
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
  searchSession.registerListener(searchListener);
  searchSession.search(null);
}

var numTotalMessages;

// nsIMsgSearchNotify implementation
var searchListener =
{ 
  onNewSearch: function() 
  {
    numTotalMessages = 0;
  },
  onSearchHit: function(dbHdr, folder)
  {
    numTotalMessages++;
  },
  onSearchDone: function(status)
  { 
    do_check_eq(numTotalMessages, 1);
    do_timeout(1000, endTest);
    return true;
  }
};

function endTest()
{
  // Cleanup, null out everything, close all cached connections and stop the
  // server
  teardownIMAPPump();
  do_test_finished();
}

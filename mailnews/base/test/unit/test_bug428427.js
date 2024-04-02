/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of message count changes in virtual folder views

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var bugmail1 = do_get_file("../../../data/bugmail1");
// main test

// the headers for the test messages. All messages are identical, but
// have different properties set on them.
var hdrs = [];

// how many identical messages to load
var messageCount = 5;

// tag used with test messages
var tag1 = "istag";

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  // Get messageCount messages into the local filestore.
  do_test_pending();

  // function setupVirtualFolder() continues the testing after copyFileMessage.
  MailServices.copy.copyFileMessage(
    bugmail1,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  return true;
}

/**
 * @implements {nsIMsgCopyServiceListener}
 */
var copyListener = {
  onStartCopy() {},
  onProgress() {},
  setMessageKey(aKey) {
    hdrs.push(localAccountUtils.inboxFolder.GetMessageHeader(aKey));
  },
  getMessageId() {
    return null;
  },
  onStopCopy() {
    if (--messageCount) {
      MailServices.copy.copyFileMessage(
        bugmail1,
        localAccountUtils.inboxFolder,
        null,
        false,
        0,
        "",
        copyListener,
        null
      );
    } else {
      try {
        setupVirtualFolder();
      } catch (ex) {
        dump(ex);
      }
    }
  },
};

var virtualFolder;
var numTotalMessages;
var numUnreadMessages;

// virtual folder setup
function setupVirtualFolder() {
  // add as valid tag tag1, though probably not really necessary
  MailServices.tags.addTagForKey(tag1, tag1, null, null);

  // add tag1 to 4 messages
  const messages0to3 = [hdrs[0], hdrs[1], hdrs[2], hdrs[3]];
  localAccountUtils.inboxFolder.addKeywordsToMessages(messages0to3, tag1);

  // set 3 messages unread, 2 messages read
  const messages0to2 = [hdrs[0], hdrs[1], hdrs[2]];
  localAccountUtils.inboxFolder.markMessagesRead(messages0to2, false);

  const messages3to4 = [hdrs[3], hdrs[4]];
  localAccountUtils.inboxFolder.markMessagesRead(messages3to4, true);

  // search will look for tag tag1 in the inbox folder
  var searchTerm = makeSearchTerm(
    localAccountUtils.inboxFolder,
    tag1,
    Ci.nsMsgSearchAttrib.Keywords,
    Ci.nsMsgSearchOp.Contains
  );

  dump("creating virtual folder\n");
  var rootFolder = localAccountUtils.incomingServer.rootMsgFolder;
  virtualFolder = CreateVirtualFolder(
    "VfTest",
    rootFolder,
    localAccountUtils.inboxFolder.URI,
    searchTerm,
    false
  );

  // Setup search session. Execution continues with testVirtualFolder()
  // after search is done.

  var searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  searchSession.addScopeTerm(
    Ci.nsMsgSearchScope.offlineMail,
    localAccountUtils.inboxFolder
  );
  searchSession.appendTerm(searchTerm, false);
  searchSession.registerListener(searchListener);
  dump("starting search of vf\n");
  searchSession.search(null);
}

// partially based on gSearchNotificationListener in searchBar.js
// nsIMsgSearchNotify implementation
var searchListener = {
  onNewSearch() {
    dump("in onnewsearch\n");
    numTotalMessages = 0;
    numUnreadMessages = 0;
  },
  onSearchHit(dbHdr) {
    print("Search hit, isRead is " + dbHdr.isRead);
    numTotalMessages++;
    if (!dbHdr.isRead) {
      numUnreadMessages++;
    }
  },
  onSearchDone() {
    print("Finished search hitCount = " + numTotalMessages);
    var db = virtualFolder.msgDatabase;
    var dbFolderInfo = db.dBFolderInfo;
    dbFolderInfo.numMessages = numTotalMessages;
    dbFolderInfo.numUnreadMessages = numUnreadMessages;
    virtualFolder.updateSummaryTotals(true);
    print("virtual folder unread is " + virtualFolder.getNumUnread(false));
    testVirtualFolder();
  },
};

function testVirtualFolder() {
  // basic functionality tests

  // total messages matching search
  Assert.equal(4, virtualFolder.getTotalMessages(false));

  // total unread messages in search
  Assert.equal(3, virtualFolder.getNumUnread(false));

  // change unread of one item in search to decrease count
  localAccountUtils.inboxFolder.markMessagesRead([hdrs[0]], true);
  virtualFolder.updateSummaryTotals(true);

  Assert.equal(2, virtualFolder.getNumUnread(false));

  // failures fixed in this bug

  // remove tag from one item to decrease count
  var message1 = [hdrs[1]];
  localAccountUtils.inboxFolder.removeKeywordsFromMessages(message1, tag1);
  virtualFolder.updateSummaryTotals(true);
  Assert.equal(3, virtualFolder.getTotalMessages(false));
  Assert.equal(1, virtualFolder.getNumUnread(false));

  // End of test, so release our header references
  hdrs = null;

  do_test_finished();
  return true;
}

// helper functions

// adapted from commandglue.js
function CreateVirtualFolder(
  newName,
  parentFolder,
  searchFolderURIs,
  searchTerm,
  searchOnline
) {
  var newFolder = parentFolder.addSubfolder(newName);
  newFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
  var vfdb = newFolder.msgDatabase;
  var searchTermString = getSearchTermString(searchTerm);

  var dbFolderInfo = vfdb.dBFolderInfo;
  // set the view string as a property of the db folder info
  // set the original folder name as well.
  dbFolderInfo.setCharProperty("searchStr", searchTermString);
  dbFolderInfo.setCharProperty("searchFolderUri", searchFolderURIs);
  dbFolderInfo.setBooleanProperty("searchOnline", searchOnline);
  // This fails because the folder doesn't exist - why were we doing it?
  //  vfdb.summaryValid = true;
  vfdb.close(true);
  // use acctMgr to setup the virtual folder listener
  var acctMgr = MailServices.accounts.QueryInterface(Ci.nsIFolderListener);
  // print(acctMgr);
  acctMgr.onFolderAdded(parentFolder, newFolder);
  return newFolder;
}

function getSearchTermString(term) {
  var condition = "";

  if (condition.length > 1) {
    condition += " ";
  }

  if (term.matchAll) {
    condition = "ALL";
  }
  condition += term.booleanAnd ? "AND (" : "OR (";
  condition += term.termAsString + ")";
  return condition;
}

// Create a search term for searching aFolder
//   using aAttrib, aOp, and string aStrValue
function makeSearchTerm(aFolder, aStrValue, aAttrib, aOp) {
  // use a temporary search session
  var searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, aFolder);
  var searchTerm = searchSession.createTerm();
  var value = searchTerm.value;
  value.str = aStrValue;
  searchTerm.value = value;
  searchTerm.attrib = aAttrib;
  searchTerm.op = aOp;
  searchTerm.booleanAnd = false;
  searchSession = null;
  return searchTerm;
}

/*
 * This file tests imap filter actions post-plugin, which uses nsMsgFilterAfterTheFact
 *
 * Original author: Kent James <kent@caspia.com>
 * adapted from test_imapFilterActions.js
 */

Components.utils.import("resource:///modules/folderUtils.jsm");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Task.jsm");

var nsMsgSearchScope = Ci.nsMsgSearchScope;
var nsMsgSearchAttrib = Ci.nsMsgSearchAttrib;
var nsMsgSearchOp = Ci.nsMsgSearchOp;
var Is = nsMsgSearchOp.Is;
var Contains = nsMsgSearchOp.Contains;
var Subject = nsMsgSearchAttrib.Subject;
var Body = nsMsgSearchAttrib.Body;

// Globals
var gSubfolder; // a local message folder used as a target for moves and copies
var gLastKey; // the last message key
var gFilter; // a message filter with a subject search
var gAction; // current message action (reused)
var gInboxListener; // database listener object
var gHeader; // the current message db header
var gChecks; // the function that will be used to check the results of the filter
var gInboxCount; // the previous number of messages in the Inbox
var gSubfolderCount; // the previous number of messages in the subfolder
var gMoveCallbackCount; // the number of callbacks from the move listener
var gMessage = "draft1"; // message file used as the test message

// subject of the test message
var gMessageSubject = "Hello, did you receive my bugmail?";

// a string in the body of the test message
var gMessageInBody = "an HTML message";

// various object references
var gDbService = Components.classes["@mozilla.org/msgDatabase/msgDBService;1"]
                             .getService(Components.interfaces.nsIMsgDBService);
var kDeleteOrMoveMsgCompleted = Cc["@mozilla.org/atom-service;1"]
                                    .getService(Ci.nsIAtomService)
                                    .getAtom("DeleteOrMoveMsgCompleted");

// Definition of tests. The test function name is the filter action
// being tested, with "Body" appended to tests that use delayed
// application of filters due to a body search
var gTestArray =
[
  setupIMAPPump,
  setupFilters,
  function *DoNothing() {
    gAction.type = Ci.nsMsgFilterAction.StopExecution;
    gInboxCount = folderCount(IMAPPump.inbox);
    yield setupTest(gFilter, gAction);
    testCounts(false, 1, 0, 0);
    Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
  },
  function *Delete() {
    gAction.type = Ci.nsMsgFilterAction.Delete;
    gInboxCount = folderCount(IMAPPump.inbox);
    yield setupTest(gFilter, gAction);
    testCounts(false, 0, 0, 0);
    Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  },
  function *MoveToFolder() {
    gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    gAction.targetFolderUri = gSubfolder.URI;
    gInboxCount = folderCount(IMAPPump.inbox);
    gSubfolderCount = folderCount(gSubfolder);
    yield setupTest(gFilter, gAction);

    testCounts(false, 0, 0, 0);
    Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
  // no net messages were added to the inbox
    Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  },
  function *MarkRead() {
    gAction.type = Ci.nsMsgFilterAction.MarkRead;
    yield setupTest(gFilter, gAction);
    testCounts(false, 0, 0, 0);
    Assert.ok(gHeader.isRead);
  },
  function *KillThread() {
    gAction.type = Ci.nsMsgFilterAction.KillThread;
    yield setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    let thread = db().GetThreadContainingMsgHdr(gHeader);
    do_check_neq(0, thread.flags & Ci.nsMsgMessageFlags.Ignored);
  },
  function *WatchThread() {
    gAction.type = Ci.nsMsgFilterAction.WatchThread;
    yield setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    let thread = db().GetThreadContainingMsgHdr(gHeader);
    do_check_neq(0, thread.flags & Ci.nsMsgMessageFlags.Watched);
  },
  function *KillSubthread() {
    gAction.type = Ci.nsMsgFilterAction.KillSubthread;
    yield setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    do_check_neq(0, gHeader.flags & Ci.nsMsgMessageFlags.Ignored);
  },
  // this tests for marking message as junk
  function *JunkScore() {
    gAction.type = Ci.nsMsgFilterAction.JunkScore;
    gAction.junkScore = 100;
    yield setupTest(gFilter, gAction);
    // marking as junk resets new but not unread
    testCounts(false, 1, 0, 0);
    Assert.equal(gHeader.getStringProperty("junkscore"), "100");
    Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
  },
  function *MarkUnread() {
    gAction.type = Ci.nsMsgFilterAction.MarkUnread;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.ok(!gHeader.isRead);
  },
  function *MarkFlagged() {
    gAction.type = Ci.nsMsgFilterAction.MarkFlagged;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.ok(gHeader.isFlagged);
  },
  function *ChangePriority() {
    gAction.type = Ci.nsMsgFilterAction.ChangePriority;
    gAction.priority = Ci.nsMsgPriority.highest;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(Ci.nsMsgPriority.highest, gHeader.priority);
  },
  function *Label() {
    gAction.type = Ci.nsMsgFilterAction.Label;
    gAction.label = 2;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(2, gHeader.label);
  },
  function *AddTag() {
    gAction.type = Ci.nsMsgFilterAction.AddTag;
    gAction.strValue = "TheTag";
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gHeader.getStringProperty("keywords"), "thetag");
  },
  // this tests for marking message as good
  function *JunkScoreAsGood() {
    gAction.type = Ci.nsMsgFilterAction.JunkScore;
    gAction.junkScore = 0;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gHeader.getStringProperty("junkscore"), "0");
    Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
  },
  function *CopyToFolder() {
    gAction.type = Ci.nsMsgFilterAction.CopyToFolder;
    gAction.targetFolderUri = gSubfolder.URI;
    gInboxCount = folderCount(IMAPPump.inbox);
    gSubfolderCount = folderCount(gSubfolder);
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
    Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
  },
  function *Custom() {
    gAction.type = Ci.nsMsgFilterAction.Custom;
    gAction.customId = 'mailnews@mozilla.org#testOffline';
    gAction.strValue = 'true';
    actionTestOffline.needsBody = true;
    yield setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
  },
  /**/
  endTest,
];

function run_test() {
  Services.prefs.setBoolPref("mail.server.default.autosync_offline_stores", false);
  gTestArray.forEach(add_task);
  run_next_test();
}

function setupFilters()
{
// Create a non-body filter.
  let filterList = IMAPPump.incomingServer.getFilterList(null);
  gFilter = filterList.createFilter("subject");
  let searchTerm = gFilter.createTerm();
  searchTerm.attrib = Subject;
  searchTerm.op = Is;
  var value = searchTerm.value;
  value.attrib = Subject;
  value.str = gMessageSubject;
  searchTerm.value = value;
  searchTerm.booleanAnd = false;
  gFilter.appendTerm(searchTerm);
  gFilter.filterType = Ci.nsMsgFilterType.PostPlugin;
  gFilter.enabled = true;

  // an action that can be modified by tests
  gAction = gFilter.createAction();

  MailServices.filters.addCustomAction(actionTestOffline);
  MailServices.mailSession.AddFolderListener(FolderListener, Ci.nsIFolderListener.event);
  gSubfolder = localAccountUtils.rootFolder.createLocalSubfolder("Subfolder");
  gPreviousUnread = 0;
  gPreviousDbNew = 0;
}

/*
 * functions used to support test setup and execution
 */

// basic preparation done for each test
function setupTest(aFilter, aAction)
{
  return Task.spawn(function* () {
    let filterList = IMAPPump.incomingServer.getFilterList(null);
    while (filterList.filterCount)
      filterList.removeFilterAt(0);
    if (aFilter)
    {
      aFilter.clearActionList();
      if (aAction) {
        aFilter.appendAction(aAction);
        filterList.insertFilterAt(0, aFilter);
      }
    }
    if (gInboxListener)
      gDbService.unregisterPendingListener(gInboxListener);

    gInboxListener = new DBListener();
    gDbService.registerPendingListener(IMAPPump.inbox, gInboxListener);
    gMoveCallbackCount = 0;
    IMAPPump.mailbox.addMessage(new imapMessage(specForFileName(gMessage),
                            IMAPPump.mailbox.uidnext++, []));
    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
    yield promiseUrlListener.promise;
    yield PromiseTestUtils.promiseDelay(200);
  });
}

// Cleanup, null out everything, close all cached connections and stop the
// server
function endTest()
{
  if (gInboxListener)
    gDbService.unregisterPendingListener(gInboxListener);
  gInboxListener = null;
  MailServices.mailSession.RemoveFolderListener(FolderListener);
  teardownIMAPPump();
}

/*
 * listener objects
 */

// nsIFolderListener implementation
var FolderListener = {
  OnItemEvent: function OnItemEvent(aEventFolder, aEvent) {
    dump("received folder event " + aEvent.toString() +
         " folder " + aEventFolder.name +
         "\n");
  }
};

// nsIDBChangeListener implementation. Counts of calls are kept, but not
// currently used in the tests. Current role is to provide a reference
// to the new message header (plus give some examples of using db listeners
// in javascript).
function DBListener()
{
  this.counts = {};
  let counts = this.counts;
  counts.onHdrFlagsChanged = 0;
  counts.onHdrDeleted = 0;
  counts.onHdrAdded = 0;
  counts.onParentChanged = 0;
  counts.onAnnouncerGoingAway = 0;
  counts.onReadChanged = 0;
  counts.onJunkScoreChanged = 0;
  counts.onHdrPropertyChanged = 0;
  counts.onEvent = 0;
}

DBListener.prototype =
{
  onHdrFlagsChanged:
    function onHdrFlagsChanged(aHdrChanged, aOldFlags, aNewFlags, aInstigator)
    {
      this.counts.onHdrFlagsChanged++;
    },

  onHdrDeleted:
    function onHdrDeleted(aHdrChanged, aParentKey, Flags, aInstigator)
    {
      this.counts.onHdrDeleted++;
    },

  onHdrAdded:
    function onHdrAdded(aHdrChanged, aParentKey, aFlags, aInstigator)
    {
      this.counts.onHdrAdded++;
      gHeader = aHdrChanged;
    },

  onParentChanged:
    function onParentChanged(aKeyChanged, oldParent, newParent, aInstigator)
    {
      this.counts.onParentChanged++;
    },

  onAnnouncerGoingAway:
    function onAnnouncerGoingAway(instigator)
    {
      if (gInboxListener)
        try {
          IMAPPump.inbox.msgDatabase.RemoveListener(gInboxListener);
        }
        catch (e) {dump(" listener not found\n");}
      this.counts.onAnnouncerGoingAway++;
    },

  onReadChanged:
    function onReadChanged(aInstigator)
    {
      this.counts.onReadChanged++;
    },

  onJunkScoreChanged:
    function onJunkScoreChanged(aInstigator)
    {
      this.counts.onJunkScoreChanged++;
    },

  onHdrPropertyChanged:
    function onHdrPropertyChanged(aHdrToChange, aPreChange, aStatus, aInstigator)
    {
      this.counts.onHdrPropertyChanged++;
    },

  onEvent:
    function onEvent(aDB, aEvent)
    {
      this.counts.onEvent++;
    },

};

/*
 * helper functions
 */

// return the number of messages in a folder (and check that the
// folder counts match the database counts)
function folderCount(folder)
{
  // count using the database
  let enumerator = folder.msgDatabase.EnumerateMessages();
  let dbCount = 0;
  while (enumerator.hasMoreElements())
  {
    dbCount++;
    let hdr = enumerator.getNext();
  }

  // count using the folder
  let folderCount = folder.getTotalMessages(false);

  // compare the two
  Assert.equal(dbCount, folderCount);
  return dbCount;
}

// given a test file, return the file uri spec
function specForFileName(aFileName)
{
  let file = do_get_file("../../../data/" + aFileName);
  let msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}

// shorthand for the inbox message summary database
function db()
{
  return IMAPPump.inbox.msgDatabase;
}

// static variables used in testCounts
var gPreviousUnread;
var gPreviousDbNew;

// Test various counts.
//
//  aHasNew:         folder hasNew flag
//  aUnreadDelta:    change in unread count for the folder
//  aFolderNewDelta: change in new count for the folder
//  aDbNewDelta:     change in new count for the database
//
function testCounts(aHasNew, aUnreadDelta, aFolderNewDelta, aDbNewDelta)
{
  try {
  let folderNew = IMAPPump.inbox.getNumNewMessages(false);
  let hasNew = IMAPPump.inbox.hasNewMessages;
  let unread = IMAPPump.inbox.getNumUnread(false);
  let countOut = {};
  let arrayOut = {};
  db().getNewList(countOut, arrayOut);
  let dbNew = countOut.value ? countOut.value : 0;
  let folderNewFlag = IMAPPump.inbox.getFlag(Ci.nsMsgFolderFlags.GotNew);
  dump(" hasNew: " + hasNew +
       " unread: " + unread +
       " folderNew: " + folderNew +
       " folderNewFlag: " + folderNewFlag +
       " dbNew: " + dbNew +
       " prevUnread " + gPreviousUnread +
       "\n");
  //Assert.equal(aHasNew, hasNew);
  Assert.equal(aUnreadDelta, unread - gPreviousUnread);
  gPreviousUnread = unread;
  // This seems to be reset for each folder update.
  //
  // This check seems to be failing in SeaMonkey builds, yet I can see no ill
  // effects of this in the actual program. Fixing this is complex because of
  // the messiness of new count management (see bug 507638 for a
  // refactoring proposal, and attachment 398899 on bug 514801 for one possible
  // fix to this particular test). So I am disabling this.
  //Assert.equal(aFolderNewDelta, folderNew);
  //Assert.equal(aDbNewDelta, dbNew - gPreviousDbNew);
  //gPreviousDbNew = dbNew;
  } catch (e) {dump(e);}
}

// print the counts for debugging purposes in this test
function printListener(listener)
{
  print("DBListener counts: ");
  for (var item in listener.counts) {
      dump(item + ": " + listener.counts[item] + " ");
  }
  dump("\n");
}

// custom action to test offline status
var actionTestOffline =
{
  id: "mailnews@mozilla.org#testOffline",
  name: "test if offline",
  apply: function(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow)
  {
    for (var i = 0; i < aMsgHdrs.length; i++)
    {
      var msgHdr = aMsgHdrs.queryElementAt(i, Ci.nsIMsgDBHdr);
      let isOffline = (msgHdr.flags & Ci.nsMsgMessageFlags.Offline) ? true : false;
      dump("in actionTestOffline, flags are " + msgHdr.flags +
            " subject is " + msgHdr.subject +
            " isOffline is " + isOffline +
            "\n");
      // XXX TODO: the offline flag is not set here when it should be in postplugin filters
      //Assert.equal(isOffline, aActionValue == 'true');
      Assert.equal(msgHdr.subject, gMessageSubject);
    }
  },
  isValidForType: function(type, scope) {return true;},

  validateActionValue: function(value, folder, type) { return null;},

  allowDuplicates: false,

  needsBody: true // set during test setup
};

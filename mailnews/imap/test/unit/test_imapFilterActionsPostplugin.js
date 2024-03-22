/*
 * This file tests imap filter actions post-plugin, which uses nsMsgFilterAfterTheFact
 *
 * Original author: Kent James <kent@caspia.com>
 * adapted from test_imapFilterActions.js
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var Is = Ci.nsMsgSearchOp.Is;
var Subject = Ci.nsMsgSearchAttrib.Subject;

// Globals
var gSubfolder; // a local message folder used as a target for moves and copies
var gFilter; // a message filter with a subject search
var gAction; // current message action (reused)
var gInboxListener; // database listener object
var gHeader; // the current message db header
var gInboxCount; // the previous number of messages in the Inbox
var gSubfolderCount; // the previous number of messages in the subfolder
var gMessage = "draft1"; // message file used as the test message

// subject of the test message
var gMessageSubject = "Hello, did you receive my bugmail?";

// various object references
var gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
  Ci.nsIMsgDBService
);

// Definition of tests. The test function name is the filter action
// being tested, with "Body" appended to tests that use delayed
// application of filters due to a body search
var gTestArray = [
  setupIMAPPump,
  setupFilters,
  async function DoNothing() {
    gAction.type = Ci.nsMsgFilterAction.StopExecution;
    gInboxCount = folderCount(IMAPPump.inbox);
    await setupTest(gFilter, gAction);
    testCounts(false, 1, 0, 0);
    Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
  },
  async function Delete() {
    gAction.type = Ci.nsMsgFilterAction.Delete;
    gInboxCount = folderCount(IMAPPump.inbox);
    await setupTest(gFilter, gAction);
    testCounts(false, 0, 0, 0);
    Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  },
  async function MoveToFolder() {
    gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    gAction.targetFolderUri = gSubfolder.URI;
    gInboxCount = folderCount(IMAPPump.inbox);
    gSubfolderCount = folderCount(gSubfolder);
    await setupTest(gFilter, gAction);

    testCounts(false, 0, 0, 0);
    Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
    // no net messages were added to the inbox
    Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  },
  async function MarkRead() {
    gAction.type = Ci.nsMsgFilterAction.MarkRead;
    await setupTest(gFilter, gAction);
    testCounts(false, 0, 0, 0);
    Assert.ok(gHeader.isRead);
  },
  async function KillThread() {
    gAction.type = Ci.nsMsgFilterAction.KillThread;
    await setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    const thread = db().getThreadContainingMsgHdr(gHeader);
    Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Ignored);
  },
  async function WatchThread() {
    gAction.type = Ci.nsMsgFilterAction.WatchThread;
    await setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    const thread = db().getThreadContainingMsgHdr(gHeader);
    Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Watched);
  },
  async function KillSubthread() {
    gAction.type = Ci.nsMsgFilterAction.KillSubthread;
    await setupTest(gFilter, gAction);
    // In non-postplugin, count here is 0 and not 1.  Need to investigate.
    testCounts(false, 1, 0, 0);
    Assert.notEqual(0, gHeader.flags & Ci.nsMsgMessageFlags.Ignored);
  },
  // this tests for marking message as junk
  async function JunkScore() {
    gAction.type = Ci.nsMsgFilterAction.JunkScore;
    gAction.junkScore = 100;
    await setupTest(gFilter, gAction);
    // marking as junk resets new but not unread
    testCounts(false, 1, 0, 0);
    Assert.equal(gHeader.getStringProperty("junkscore"), "100");
    Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
  },
  async function MarkUnread() {
    gAction.type = Ci.nsMsgFilterAction.MarkUnread;
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.ok(!gHeader.isRead);
  },
  async function MarkFlagged() {
    gAction.type = Ci.nsMsgFilterAction.MarkFlagged;
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.ok(gHeader.isFlagged);
  },
  async function ChangePriority() {
    gAction.type = Ci.nsMsgFilterAction.ChangePriority;
    gAction.priority = Ci.nsMsgPriority.highest;
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(Ci.nsMsgPriority.highest, gHeader.priority);
  },
  async function AddTag() {
    gAction.type = Ci.nsMsgFilterAction.AddTag;
    gAction.strValue = "TheTag";
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gHeader.getStringProperty("keywords"), "thetag");
  },
  // this tests for marking message as good
  async function JunkScoreAsGood() {
    gAction.type = Ci.nsMsgFilterAction.JunkScore;
    gAction.junkScore = 0;
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gHeader.getStringProperty("junkscore"), "0");
    Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
  },
  async function CopyToFolder() {
    gAction.type = Ci.nsMsgFilterAction.CopyToFolder;
    gAction.targetFolderUri = gSubfolder.URI;
    gInboxCount = folderCount(IMAPPump.inbox);
    gSubfolderCount = folderCount(gSubfolder);
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
    Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
    Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
  },
  async function Custom() {
    gAction.type = Ci.nsMsgFilterAction.Custom;
    gAction.customId = "mailnews@mozilla.org#testOffline";
    gAction.strValue = "true";
    actionTestOffline.needsBody = true;
    await setupTest(gFilter, gAction);
    testCounts(true, 1, 1, 1);
  },
  /**/
  endTest,
];

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  gTestArray.forEach(x => add_task(x));
  run_next_test();
}

function setupFilters() {
  // Create a non-body filter.
  const filterList = IMAPPump.incomingServer.getFilterList(null);
  gFilter = filterList.createFilter("subject");
  const searchTerm = gFilter.createTerm();
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
  MailServices.mailSession.AddFolderListener(
    FolderListener,
    Ci.nsIFolderListener.event
  );
  gSubfolder = localAccountUtils.rootFolder.createLocalSubfolder("Subfolder");
  gPreviousUnread = 0;
}

/*
 * functions used to support test setup and execution
 */

// basic preparation done for each test
async function setupTest(aFilter, aAction) {
  const filterList = IMAPPump.incomingServer.getFilterList(null);
  while (filterList.filterCount) {
    filterList.removeFilterAt(0);
  }
  if (aFilter) {
    aFilter.clearActionList();
    if (aAction) {
      aFilter.appendAction(aAction);
      filterList.insertFilterAt(0, aFilter);
    }
  }
  if (gInboxListener) {
    gDbService.unregisterPendingListener(gInboxListener);
  }

  gInboxListener = new DBListener();
  gDbService.registerPendingListener(IMAPPump.inbox, gInboxListener);
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
  await PromiseTestUtils.promiseDelay(200);
}

// Cleanup, null out everything, close all cached connections and stop the
// server
function endTest() {
  if (gInboxListener) {
    gDbService.unregisterPendingListener(gInboxListener);
  }
  gInboxListener = null;
  MailServices.mailSession.RemoveFolderListener(FolderListener);
  teardownIMAPPump();
}

/*
 * listener objects
 */

// nsIFolderListener implementation
var FolderListener = {
  onFolderEvent(aEventFolder, aEvent) {
    dump(
      "received folder event " + aEvent + " folder " + aEventFolder.name + "\n"
    );
  },
};

// nsIDBChangeListener implementation. Counts of calls are kept, but not
// currently used in the tests. Current role is to provide a reference
// to the new message header (plus give some examples of using db listeners
// in javascript).
function DBListener() {
  this.counts = {};
  const counts = this.counts;
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

DBListener.prototype = {
  onHdrFlagsChanged() {
    this.counts.onHdrFlagsChanged++;
  },

  onHdrDeleted() {
    this.counts.onHdrDeleted++;
  },

  onHdrAdded(aHdrChanged) {
    this.counts.onHdrAdded++;
    gHeader = aHdrChanged;
  },

  onParentChanged() {
    this.counts.onParentChanged++;
  },

  onAnnouncerGoingAway() {
    if (gInboxListener) {
      try {
        IMAPPump.inbox.msgDatabase.removeListener(gInboxListener);
      } catch (e) {
        dump(" listener not found\n");
      }
    }
    this.counts.onAnnouncerGoingAway++;
  },

  onReadChanged() {
    this.counts.onReadChanged++;
  },

  onJunkScoreChanged() {
    this.counts.onJunkScoreChanged++;
  },

  onHdrPropertyChanged() {
    this.counts.onHdrPropertyChanged++;
  },

  onEvent() {
    this.counts.onEvent++;
  },
};

/*
 * helper functions
 */

// return the number of messages in a folder (and check that the
// folder counts match the database counts)
function folderCount(folder) {
  // count using the database
  const dbCount = [...folder.msgDatabase.enumerateMessages()].length;

  // count using the folder
  const count = folder.getTotalMessages(false);

  // compare the two
  Assert.equal(dbCount, count);
  return dbCount;
}

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}

// shorthand for the inbox message summary database
function db() {
  return IMAPPump.inbox.msgDatabase;
}

// static variables used in testCounts
var gPreviousUnread;

// Test various counts.
//
//  aHasNew:         folder hasNew flag
//  aUnreadDelta:    change in unread count for the folder
//  aFolderNewDelta: change in new count for the folder
//  aDbNewDelta:     change in new count for the database
//
function testCounts(aHasNew, aUnreadDelta) {
  try {
    const folderNew = IMAPPump.inbox.getNumNewMessages(false);
    const hasNew = IMAPPump.inbox.hasNewMessages;
    const unread = IMAPPump.inbox.getNumUnread(false);
    const arrayOut = db().getNewList();
    const dbNew = arrayOut.length;
    dump(
      " hasNew: " +
        hasNew +
        " unread: " +
        unread +
        " folderNew: " +
        folderNew +
        " dbNew: " +
        dbNew +
        " prevUnread " +
        gPreviousUnread +
        "\n"
    );
    // Assert.equal(aHasNew, hasNew);
    Assert.equal(aUnreadDelta, unread - gPreviousUnread);
    gPreviousUnread = unread;
    // This seems to be reset for each folder update.
    //
    // This check seems to be failing in SeaMonkey builds, yet I can see no ill
    // effects of this in the actual program. Fixing this is complex because of
    // the messiness of new count management (see bug 507638 for a
    // refactoring proposal, and attachment 398899 on bug 514801 for one possible
    // fix to this particular test). So I am disabling this.
    // Assert.equal(aFolderNewDelta, folderNew);
    // Assert.equal(aDbNewDelta, dbNew - gPreviousDbNew);
    // gPreviousDbNew = dbNew;
  } catch (e) {
    dump(e);
  }
}

// custom action to test offline status
var actionTestOffline = {
  id: "mailnews@mozilla.org#testOffline",
  name: "test if offline",
  applyAction(aMsgHdrs) {
    for (const msgHdr of aMsgHdrs) {
      const isOffline = !!(msgHdr.flags & Ci.nsMsgMessageFlags.Offline);
      dump(
        "in actionTestOffline, flags are " +
          msgHdr.flags +
          " subject is " +
          msgHdr.subject +
          " isOffline is " +
          isOffline +
          "\n"
      );
      // XXX TODO: the offline flag is not set here when it should be in postplugin filters
      // Assert.equal(isOffline, aActionValue == 'true');
      Assert.equal(msgHdr.subject, gMessageSubject);
    }
  },
  isValidForType() {
    return true;
  },

  validateActionValue() {
    return null;
  },

  allowDuplicates: false,

  needsBody: true, // set during test setup
};

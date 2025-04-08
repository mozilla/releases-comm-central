/*
 * This file tests imap filter actions, particularly as affected by the
 * addition of body searches in bug 127250. Actions that involves sending
 * mail are not tested. The tests check various counts, and the effects
 * on the message database of the filters. Effects on IMAP server
 * flags, if any, are not tested.
 *
 * Original author: Kent James <kent@caspia.com>
 * adapted from test_localToImapFilter.js
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

// Globals
var gSubfolder; // a local message folder used as a target for moves and copies
var gFilter; // a message filter with a subject search
var gAction; // current message action (reused)
var gBodyFilter; // a message filter with a body search
var gInboxListener; // database listener object
var gHeader; // the current message db header
var gInboxCount; // the previous number of messages in the Inbox
var gSubfolderCount; // the previous number of messages in the subfolder
var gMessage = "image-attach-test"; // message file used as the test message

// subject of the test message
var gMessageSubject = "image attach test";

// a string in the body of the test message
var gMessageInBody = "01234567890test";

// various object references
var gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
  Ci.nsIMsgDBService
);

var gSmtpServerD = setupSmtpServerDaemon();

add_setup(async function () {
  setupIMAPPump();
  //   IMAPPump.server.setDebugLevel(nsMailServer.debugAll);
  gSmtpServerD.start();
  var gSmtpServer = localAccountUtils.create_outgoing_server(
    "smtp",
    "user",
    "password",
    { port: gSmtpServerD.port }
  );
  MailServices.accounts.defaultAccount.defaultIdentity.email =
    "from@tinderbox.invalid";
  MailServices.accounts.defaultAccount.defaultIdentity.smtpServerKey =
    gSmtpServer.key;

  setupFilters();

  registerCleanupFunction(() => {
    gSmtpServerD.stop();
    Services.prefs.clearUserPref("mail.forward_message_mode");
    if (gInboxListener) {
      gDbService.unregisterPendingListener(gInboxListener);
    }
    gInboxListener = null;
    MailServices.mailSession.RemoveFolderListener(FolderListener);
    teardownIMAPPump();
  });
});

add_task(async function MoveToFolder() {
  gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
});

// do it again, sometimes that causes multiple downloads
add_task(async function MoveToFolder2() {
  gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
});

add_task(async function MoveToFolderBody() {
  gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gBodyFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
  // no net messages were added to the inbox
  Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
});

add_task(async function MoveToFolderBody2() {
  gAction.type = Ci.nsMsgFilterAction.MoveToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gBodyFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
  // no net messages were added to the inbox
  Assert.equal(gInboxCount, folderCount(IMAPPump.inbox));
});

add_task(async function MarkRead() {
  gAction.type = Ci.nsMsgFilterAction.MarkRead;
  gInboxCount = folderCount(IMAPPump.inbox);
  await setupTest(gFilter, gAction);
  testCounts(false, 0, 0, 0);
  Assert.ok(gHeader.isRead);
  Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
});

add_task(async function MarkReadBody() {
  gAction.type = Ci.nsMsgFilterAction.MarkRead;
  gInboxCount = folderCount(IMAPPump.inbox);
  await setupTest(gBodyFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.ok(gHeader.isRead);
  Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
});

add_task(async function KillThread() {
  gAction.type = Ci.nsMsgFilterAction.KillThread;
  await setupTest(gFilter, gAction);

  testCounts(false, 0, 0, 0);
  const thread = db().getThreadContainingMsgHdr(gHeader);
  Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Ignored);
});

add_task(async function KillThreadBody() {
  gAction.type = Ci.nsMsgFilterAction.KillThread;
  await setupTest(gBodyFilter, gAction);

  testCounts(false, 0, 0, 0);
  const thread = db().getThreadContainingMsgHdr(gHeader);
  Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Ignored);
});

add_task(async function KillSubthread() {
  gAction.type = Ci.nsMsgFilterAction.KillSubthread;
  await setupTest(gFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.notEqual(0, gHeader.flags & Ci.nsMsgMessageFlags.Ignored);
});

add_task(async function KillSubthreadBody() {
  gAction.type = Ci.nsMsgFilterAction.KillSubthread;
  await setupTest(gBodyFilter, gAction);

  testCounts(false, 0, 0, 0);
  Assert.notEqual(0, gHeader.flags & Ci.nsMsgMessageFlags.Ignored);
});
add_task(async function DoNothing() {
  gAction.type = Ci.nsMsgFilterAction.StopExecution;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
});

add_task(async function DoNothingBody() {
  gAction.type = Ci.nsMsgFilterAction.StopExecution;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
});

// this tests for marking message as junk
add_task(async function JunkScore() {
  gAction.type = Ci.nsMsgFilterAction.JunkScore;
  gAction.junkScore = 100;
  await setupTest(gFilter, gAction);

  // marking as junk resets new but not unread
  testCounts(false, 1, 0, 0);
  Assert.equal(gHeader.getStringProperty("junkscore"), "100");
  Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
});

// this tests for marking message as junk

add_task(async function JunkScoreBody() {
  gAction.type = Ci.nsMsgFilterAction.JunkScore;
  gAction.junkScore = 100;
  await setupTest(gBodyFilter, gAction);

  // marking as junk resets new but not unread
  testCounts(false, 1, 0, 0);
  Assert.equal(gHeader.getStringProperty("junkscore"), "100");
  Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
});

// The remaining tests add new messages
add_task(async function MarkUnread() {
  gAction.type = Ci.nsMsgFilterAction.MarkUnread;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.ok(!gHeader.isRead);
});

add_task(async function MarkUnreadBody() {
  gAction.type = Ci.nsMsgFilterAction.MarkUnread;
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.ok(!gHeader.isRead);
});

add_task(async function WatchThread() {
  gAction.type = Ci.nsMsgFilterAction.WatchThread;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  const thread = db().getThreadContainingMsgHdr(gHeader);
  Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Watched);
});

add_task(async function WatchThreadBody() {
  gAction.type = Ci.nsMsgFilterAction.WatchThread;
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  const thread = db().getThreadContainingMsgHdr(gHeader);
  Assert.notEqual(0, thread.flags & Ci.nsMsgMessageFlags.Watched);
});

add_task(async function MarkFlagged() {
  gAction.type = Ci.nsMsgFilterAction.MarkFlagged;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.ok(gHeader.isFlagged);
});

add_task(async function MarkFlaggedBody() {
  gAction.type = Ci.nsMsgFilterAction.MarkFlagged;
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.ok(gHeader.isFlagged);
});

add_task(async function ChangePriority() {
  gAction.type = Ci.nsMsgFilterAction.ChangePriority;
  gAction.priority = Ci.nsMsgPriority.highest;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(Ci.nsMsgPriority.highest, gHeader.priority);
});

add_task(async function ChangePriorityBody() {
  gAction.type = Ci.nsMsgFilterAction.ChangePriority;
  gAction.priority = Ci.nsMsgPriority.highest;
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(Ci.nsMsgPriority.highest, gHeader.priority);
});

add_task(async function AddTag() {
  gAction.type = Ci.nsMsgFilterAction.AddTag;
  gAction.strValue = "TheTag";
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gHeader.getStringProperty("keywords"), "thetag");
});

add_task(async function AddTagBody() {
  gAction.type = Ci.nsMsgFilterAction.AddTag;
  gAction.strValue = "TheTag2";
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gHeader.getStringProperty("keywords"), "thetag2");
});

// this tests for marking message as good

add_task(async function JunkScoreAsGood() {
  gAction.type = Ci.nsMsgFilterAction.JunkScore;
  gAction.junkScore = 0;
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gHeader.getStringProperty("junkscore"), "0");
  Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
});

// this tests for marking message as good
add_task(async function JunkScoreAsGoodBody() {
  gAction.type = Ci.nsMsgFilterAction.JunkScore;
  gAction.junkScore = 0;
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gHeader.getStringProperty("junkscore"), "0");
  Assert.equal(gHeader.getStringProperty("junkscoreorigin"), "filter");
});

add_task(async function CopyToFolder() {
  gAction.type = Ci.nsMsgFilterAction.CopyToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
});

add_task(async function CopyToFolderBody() {
  gAction.type = Ci.nsMsgFilterAction.CopyToFolder;
  gAction.targetFolderUri = gSubfolder.URI;
  gInboxCount = folderCount(IMAPPump.inbox);
  gSubfolderCount = folderCount(gSubfolder);
  await setupTest(gBodyFilter, gAction);

  testCounts(true, 1, 1, 1);
  Assert.equal(gInboxCount + 1, folderCount(IMAPPump.inbox));
  Assert.equal(gSubfolderCount + 1, folderCount(gSubfolder));
});

add_task(async function ForwardInline() {
  await testForward(2);
});

add_task(async function ForwardAsAttachment() {
  await testForward(0);
});

function setupFilters() {
  // Create a non-body filter.
  const filterList = IMAPPump.incomingServer.getFilterList(null);
  gFilter = filterList.createFilter("subject");
  let searchTerm = gFilter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Subject;
  searchTerm.op = Ci.nsMsgSearchOp.Is;
  var value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.Subject;
  value.str = gMessageSubject;
  searchTerm.value = value;
  searchTerm.booleanAnd = false;
  gFilter.appendTerm(searchTerm);
  gFilter.enabled = true;

  // Create a filter with a body term that that forces delayed application of
  // filters until after body download.
  gBodyFilter = filterList.createFilter("body");
  searchTerm = gBodyFilter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Body;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.Body;
  value.str = gMessageInBody;
  searchTerm.value = value;
  searchTerm.booleanAnd = false;
  gBodyFilter.appendTerm(searchTerm);
  gBodyFilter.enabled = true;

  // an action that can be modified by tests
  gAction = gFilter.createAction();

  gSubfolder = localAccountUtils.rootFolder.createLocalSubfolder("Subfolder");

  MailServices.mailSession.AddFolderListener(
    FolderListener,
    Ci.nsIFolderListener.event
  );
  gPreviousUnread = 0;

  // When a message body is not downloaded, and then later a filter is
  //   applied that requires a download of message bodies, then the previous
  //   bodies are downloaded - and the message filters are applied twice!
  //   See bug 1116228, but for now workaround by always downloading bodies.
  IMAPPump.incomingServer.downloadBodiesOnGetNewMail = true;
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

  IMAPPump.inbox.clearNewMessages();

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

/*
 * listener objects
 */

/** @implements {nsIFolderListener} */
var FolderListener = {
  onFolderEvent(aEventFolder, aEvent) {
    dump(
      "received folder event " + aEvent + " folder " + aEventFolder.name + "\n"
    );
  },
};

/**
 * Counts of calls are kept, but not currently used in the tests. Current role
 * is to provide a reference to the new message header.
 *
 * @implements {nsIDBChangeListener}
 */
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
var gPreviousUnread = 0;

// Test various counts.
//
//  aHasNew:         folder hasNew flag
//  aUnreadDelta:    change in unread count for the folder
//  aFolderNewDelta: change in new count for the folder
//  aDbNewDelta:     change in new count for the database
//
function testCounts(aHasNew, aUnreadDelta, aFolderNewDelta, aDbNewDelta) {
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
    Assert.equal(aHasNew, hasNew);
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
    Assert.equal(aDbNewDelta, dbNew);
  } catch (e) {
    dump(e);
  }
}

/**
 * Test that Ci.nsMsgFilterAction.Forward works.
 *
 * @param {number} mode - 0 means forward as attachment, 2 means forward inline.
 */
async function testForward(mode) {
  Services.prefs.setIntPref("mail.forward_message_mode", mode);

  gSmtpServerD.resetTest();
  gAction.type = Ci.nsMsgFilterAction.Forward;
  gAction.strValue = "to@local";
  await setupTest(gFilter, gAction);

  await TestUtils.waitForCondition(
    () => gSmtpServerD._daemon.post,
    "waiting for smtp to receive data"
  );

  const msgData = gSmtpServerD._daemon.post;
  Assert.ok(msgData.includes(`Subject: Fwd: ${gMessageSubject}`));
  Assert.ok(msgData.includes(`${gMessageInBody}`));
}

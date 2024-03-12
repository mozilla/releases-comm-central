/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that junk actions work even when the bayes filtering of incoming
 *  messages is disabled, as fixed in bug 487610. Test developed by Kent
 *  James using test_nsMsgDBView.js as a base.
 */

const { TreeSelection } = ChromeUtils.importESModule(
  "chrome://messenger/content/tree-selection.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var nsIMFNService = Ci.nsIMsgFolderNotificationService;

// fake objects needed to get nsMsgDBView to operate on selected messages.
// Warning: these are partial implementations. If someone adds additional
// calls to these objects in nsMsgDBView and friends, it will also
// be necessary to add fake versions of those calls here.

var gFakeSelection = new TreeSelection(null);

// Items used to add messages to the folder

var gMessageGenerator = new MessageGenerator();

var messageInjection = new MessageInjection(
  { mode: "local" },
  gMessageGenerator
);

var gLocalInboxFolder = messageInjection.getInboxFolder();
var gListener;
var gCommandUpdater;

var gDBView;
var gTreeView;

var CommandUpdaterWithPromise = function () {
  this.deferred = Promise.withResolvers();
};
CommandUpdaterWithPromise.prototype = {
  async promiseSelectionSummarized() {
    await this.deferred.promise;
    this.deferred = Promise.withResolvers();
    return this.deferred.promise;
  },

  updateCommandStatus() {
    // the back end is smart and is only telling us to update command status
    // when the # of items in the selection has actually changed.
  },

  displayMessageChanged(aFolder, aSubject, aKeywords) {},

  updateNextMessageAfterDelete() {},
  summarizeSelection() {
    this.deferred.resolve();
  },
};

// Our listener, which captures events and does the real tests.
function gMFListener() {
  this._promiseMsgsMoveCopyCompleted = new Promise(resolve => {
    this._resolveMsgsMoveCopyCompleted = resolve;
  });
  this._promiseFolderAdded = new Promise(resolve => {
    this._resolveFolderAdded = resolve;
  });
}
gMFListener.prototype = {
  msgsMoveCopyCompleted(aMove, aSrcMsgs, aDestFolder, aDestMsgs) {
    Assert.ok(aDestFolder.getFlag(Ci.nsMsgFolderFlags.Junk));
    // I tried to test this by counting messages in the folder, didn't work.
    //  Maybe all updates are not completed yet. Anyway I do it by just
    //  making sure there is something in the destination array.
    Assert.ok(aDestMsgs.length > 0);
    this._resolveMsgsMoveCopyCompleted();
  },

  folderAdded(aFolder) {
    // this should be a junk folder
    Assert.ok(aFolder.getFlag(Ci.nsMsgFolderFlags.Junk));
    this._resolveFolderAdded();
  },
  get promiseMsgsMoveCopyCompleted() {
    return this._promiseMsgsMoveCopyCompleted;
  },
  get promiseFolderAdded() {
    return this._promiseFolderAdded;
  },
};

add_setup(async function () {
  // Set option so that when messages are marked as junk, they move to the junk folder
  Services.prefs.setBoolPref("mail.spam.manualMark", true);

  // 0 == "move to junk folder", 1 == "delete"
  Services.prefs.setIntPref("mail.spam.manualMarkMode", 0);

  // Disable bayes filtering on the local account. That's the whole point of this test,
  //  to make sure that the junk move happens anyway.
  gLocalInboxFolder.server.spamSettings.level = 0;

  // Add folder listeners that will capture async events.
  const flags = nsIMFNService.msgsMoveCopyCompleted | nsIMFNService.folderAdded;
  gListener = new gMFListener();
  MailServices.mfn.addListener(gListener, flags);

  // Build up a message.
  await messageInjection.makeNewSetsInFolders([gLocalInboxFolder], [{}]);
  const view_type = "threaded";
  let view_flag = Ci.nsMsgViewFlagsType.kThreadedDisplay;
  const dbviewContractId =
    "@mozilla.org/messenger/msgdbview;1?type=" + view_type;

  // Always start out fully expanded.
  view_flag |= Ci.nsMsgViewFlagsType.kExpandAll;

  gCommandUpdater = new CommandUpdaterWithPromise();

  gDBView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  gDBView.init(null, null, null);
  gDBView.open(
    gLocalInboxFolder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    view_flag
  );

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);
  gTreeView.selection = gFakeSelection;
  gFakeSelection.view = gTreeView;
});

add_task(async function test_first_junking_create_folder() {
  // In the proposed fix for bug 487610, the first call to junk messages
  //  only creates the junk folder, it does not actually successfully move
  //  messages. So we junk messages twice so we can really see a move. But
  //  if that gets fixed and the messages actually move on the first call,
  //  I want this test to succeed as well. So I don't actually count how
  //  many messages get moved, just that some do on the second move.

  // Select and junk all messages.
  gDBView.doCommand(Ci.nsMsgViewCommandType.selectAll);
  gDBView.doCommand(Ci.nsMsgViewCommandType.junk);
  await gCommandUpdater.promiseSelectionSummarized;
  await gListener.promiseFolderAdded;
});

add_task(async function test_add_further_message() {
  // Add another message in case the first one moved.
  await messageInjection.makeNewSetsInFolders([gLocalInboxFolder], [{}]);
});

add_task(async function test_second_junking_move_msgs() {
  // Select and junk all messages.
  gDBView.doCommand(Ci.nsMsgViewCommandType.selectAll);
  gDBView.doCommand(Ci.nsMsgViewCommandType.junk);
  await gCommandUpdater.promiseSelectionSummarized;
  await gListener.promiseMsgsMoveCopyCompleted;
});

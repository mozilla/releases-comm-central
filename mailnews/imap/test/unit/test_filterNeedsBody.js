/*
 * This file tests the needsBody attribute added to a
 *  custom filter action in bug 555051.
 *
 * Original author: Kent James <kent@caspia.com>
 * adapted from test_imapFilterActions.js
 */

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");

// Globals
var gFilter; // a message filter with a subject search
var gAction; // current message action (reused)
var gMessage = "draft1"; // message file used as the test message

// Definition of tests
var tests = [
  setupIMAPPump,
  setup,
  function NeedsBodyTrue() {
    gAction.type = Ci.nsMsgFilterAction.Custom;
    gAction.customId = "mailnews@mozilla.org#testOffline";
    actionTestOffline.needsBody = true;
    gAction.strValue = "true";
  },
  runFilterAction,
  function NeedsBodyFalse() {
    gAction.type = Ci.nsMsgFilterAction.Custom;
    gAction.customId = "mailnews@mozilla.org#testOffline";
    actionTestOffline.needsBody = false;
    gAction.strValue = "false";
  },
  runFilterAction,
  teardownIMAPPump,
];

function setup() {
  // Create a test filter.
  const filterList = IMAPPump.incomingServer.getFilterList(null);
  gFilter = filterList.createFilter("test offline");
  const searchTerm = gFilter.createTerm();
  searchTerm.matchAll = true;

  gFilter.appendTerm(searchTerm);
  gFilter.enabled = true;

  // an action that can be modified by tests
  gAction = gFilter.createAction();

  // add the custom actions
  MailServices.filters.addCustomAction(actionTestOffline);
}

// basic preparation done for each test
async function runFilterAction() {
  const filterList = IMAPPump.incomingServer.getFilterList(null);
  while (filterList.filterCount) {
    filterList.removeFilterAt(0);
  }
  if (gFilter) {
    gFilter.clearActionList();
    if (gAction) {
      gFilter.appendAction(gAction);
      filterList.insertFilterAt(0, gFilter);
    }
  }
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
}

function run_test() {
  tests.forEach(x => add_task(x));
  run_next_test();
}

// custom action to test offline status
var actionTestOffline = {
  id: "mailnews@mozilla.org#testOffline",
  name: "test if offline",
  applyAction(aMsgHdrs, aActionValue) {
    for (const msgHdr of aMsgHdrs) {
      const isOffline = msgHdr.flags & Ci.nsMsgMessageFlags.Offline;
      Assert.equal(!!isOffline, aActionValue == "true");
    }
  },
  isValidForType() {
    return true;
  },

  validateActionValue() {
    return null;
  },

  allowDuplicates: false,

  needsBody: false, // set during test setup
};

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file(gDEPTH + "mailnews/data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}

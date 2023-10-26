/*
 * This file tests that a pop3 move filter doesn't leave the
 * original message in the inbox.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gFiles = ["../../../data/bugmail10", "../../../data/bugmail11"];

// make sure limiting download size doesn't causes issues with move filters.
Services.prefs.setBoolPref(
  "mail.server.default.limit_offline_message_size",
  true
);
Services.prefs.setBoolPref("mail.server.default.leave_on_server", true);

// Currently we have two mailbox storage formats.
var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1",
];

var previews = {
  "[Bug 436880] IMAP itemDeleted and itemMoveCopyCompleted notifications quite broken":
    "Do not reply to this email. You can add comments to this bug at https://bugzilla.mozilla.org/show_bug.cgi?id=436880 -- Configure bugmail: https://bugzilla.mozilla.org/userprefs.cgi?tab=email ------- You are receiving this mail because: -----",
  "Bugzilla: confirm account creation":
    "Bugzilla has received a request to create a user account using your email address (example@example.org). To confirm that you want to create an account using that email address, visit the following link: https://bugzilla.mozilla.org/token.cgi?t=xxx",
};

var gMoveFolder;
var gFilter; // the test filter
var gFilterList;
var gTestArray = [
  function createFilters() {
    gFilterList = gPOP3Pump.fakeServer.getFilterList(null);
    gFilter = gFilterList.createFilter("MoveAll");
    const searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    const moveAction = gFilter.createAction();
    moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    moveAction.targetFolderUri = gMoveFolder.URI;
    gFilter.appendAction(moveAction);
    gFilter.enabled = true;
    gFilter.filterType = Ci.nsMsgFilterType.InboxRule;
    gFilterList.insertFilterAt(0, gFilter);
  },
  // just get a message into the local folder
  async function getLocalMessages1() {
    gPOP3Pump.files = gFiles;
    await gPOP3Pump.run();
  },
  async function verifyFolders2() {
    Assert.equal(folderCount(gMoveFolder), 2);
    // the local inbox folder should now be empty, since we moved incoming mail.
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);

    // invalidate the inbox summary file, to be sure that we really moved
    // the mail.
    localAccountUtils.inboxFolder.msgDatabase.summaryValid = false;
    localAccountUtils.inboxFolder.msgDatabase = null;
    localAccountUtils.inboxFolder.ForceDBClosed();
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    try {
      localAccountUtils.inboxFolder.getDatabaseWithReparse(
        promiseUrlListener,
        null
      );
    } catch (ex) {
      await promiseUrlListener.promise;
      Assert.ok(ex.result == Cr.NS_ERROR_NOT_INITIALIZED);
      return;
    }
    // This statement isn't reached since the error is thrown.
    Assert.ok(false);
  },
  function verifyMessages() {
    const hdrs = [];
    const keys = [];
    for (const hdr of gMoveFolder.msgDatabase.enumerateMessages()) {
      keys.push(hdr.messageKey);
      hdrs.push(hdr);
    }
    Assert.ok(!gMoveFolder.fetchMsgPreviewText(keys, null));
    Assert.equal(
      hdrs[0].getStringProperty("preview"),
      previews[hdrs[0].subject]
    );
    Assert.equal(
      hdrs[1].getStringProperty("preview"),
      previews[hdrs[1].subject]
    );
  },
];

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}

function setup_store(storeID) {
  return function _setup_store() {
    // Reset pop3Pump with correct mailbox format.
    gPOP3Pump.resetPluggableStore(storeID);

    // Make sure we're not quarantining messages
    Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);

    if (!localAccountUtils.inboxFolder) {
      localAccountUtils.loadLocalMailAccount();
    }

    gMoveFolder =
      localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder");
  };
}

function run_test() {
  for (const store of gPluggableStores) {
    add_task(setup_store(store));
    gTestArray.forEach(x => add_task(x));
  }

  add_task(exitTest);
  run_next_test();
}

function exitTest() {
  // Cleanup and exit the test.
  info("Exiting mail tests\n");
  gPOP3Pump = null;
}

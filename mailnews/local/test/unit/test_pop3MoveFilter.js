/*
 * This file tests that a pop3 move filter doesn't leave the
 * original message in the inbox.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */


load("../../../resources/POP3pump.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

var gFiles = ["../../../data/bugmail10", "../../../data/bugmail11"];

// make sure limiting download size doesn't causes issues with move filters.
Services.prefs.setBoolPref("mail.server.default.limit_offline_message_size", true);
Services.prefs.setBoolPref("mail.server.default.leave_on_server", true);

// Currently we have two mailbox storage formats.
var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1"
];

var previews = {
"[Bug 436880] IMAP itemDeleted and itemMoveCopyCompleted notifications quite broken": 'Do not reply to this email. You can add comments to this bug at https://bugzilla.mozilla.org/show_bug.cgi?id=436880 -- Configure bugmail: https://bugzilla.mozilla.org/userprefs.cgi?tab=email ------- You are receiving this mail because: -----',
"Bugzilla: confirm account creation": 'Bugzilla has received a request to create a user account using your email address (example@example.org). To confirm that you want to create an account using that email address, visit the following link: https://bugzilla.mozilla.org/token.cgi?t=xxx'
};

var gMoveFolder;
var gFilter; // the test filter
var gFilterList;
var gTestArray =
[
  function createFilters() {
    gFilterList = gPOP3Pump.fakeServer.getFilterList(null);
    gFilter = gFilterList.createFilter("MoveAll");
    let searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    let moveAction = gFilter.createAction();
    moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    moveAction.targetFolderUri = gMoveFolder.URI;
    gFilter.appendAction(moveAction);
    gFilter.enabled = true;
    gFilter.filterType = Ci.nsMsgFilterType.InboxRule;
    gFilterList.insertFilterAt(0, gFilter);
  },
  // just get a message into the local folder
  function *getLocalMessages1() {
    gPOP3Pump.files = gFiles;
    yield gPOP3Pump.run();
  },
  function *verifyFolders2() {
    do_check_eq(folderCount(gMoveFolder), 2);
    // the local inbox folder should now be empty, since we moved incoming mail.
    do_check_eq(folderCount(localAccountUtils.inboxFolder), 0);

    // invalidate the inbox summary file, to be sure that we really moved
    // the mail.
    localAccountUtils.inboxFolder.msgDatabase.summaryValid = false;
    localAccountUtils.inboxFolder.msgDatabase = null;
    localAccountUtils.inboxFolder.ForceDBClosed();
    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    try {
      localAccountUtils.inboxFolder
                       .getDatabaseWithReparse(promiseUrlListener, null);
    } catch(ex) {
      yield promiseUrlListener.promise;
      do_check_true(ex.result == Cr.NS_ERROR_NOT_INITIALIZED);
      return;
    }
    // This statement isn't reached since the error is thrown.
    do_check_true(false);
  },
  function verifyMessages() {
    let hdrs = [];
    let keys = [];
    let enumerator = gMoveFolder.msgDatabase.EnumerateMessages();
    while (enumerator.hasMoreElements())
    {
      let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      keys.push(hdr.messageKey);
      hdrs.push(hdr);
    }
    do_check_false(gMoveFolder.fetchMsgPreviewText(keys, keys.length, false,
                                                   null));
    do_check_eq(hdrs[0].getStringProperty('preview'), previews[hdrs[0].subject]);
    do_check_eq(hdrs[1].getStringProperty('preview'), previews[hdrs[1].subject]);
  },
];

function folderCount(folder)
{
  let enumerator = folder.msgDatabase.EnumerateMessages();
  let count = 0;
  while (enumerator.hasMoreElements())
  {
    count++;
    let hdr = enumerator.getNext();
  }
  return count;
}

function setup_store(storeID)
{
  return function _setup_store() {
    // Reset pop3Pump with correct mailbox format.
    gPOP3Pump.resetPluggableStore(storeID);

    // Make sure we're not quarantining messages
    Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);

    if (!localAccountUtils.inboxFolder)
      localAccountUtils.loadLocalMailAccount();

    gMoveFolder = localAccountUtils.rootFolder
                                   .createLocalSubfolder("MoveFolder");
  }
}

function run_test()
{
  for (let store of gPluggableStores) {
    add_task(setup_store(store));
    gTestArray.forEach(add_task);
  }

  add_task(exitTest);
  run_next_test();
}

function exitTest()
{
  // Cleanup and exit the test.
  do_print("Exiting mail tests\n");
  gPOP3Pump = null;
}


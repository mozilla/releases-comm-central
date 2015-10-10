/*
 * This file tests that a pop3 move filter doesn't reuse msg hdr
 * info from previous moves.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */


load("../../../resources/POP3pump.js");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");
var gFiles = ["../../../data/bugmail10", "../../../data/basic1"];

Services.prefs.setBoolPref("mail.server.default.leave_on_server", true);

// Currently we have two mailbox storage formats.
var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1"
];
var basic1_preview = 'Hello, world!';
var bugmail10_preview = 'Do not reply to this email. You can add comments to this bug at https://bugzilla.mozilla.org/show_bug.cgi?id=436880 -- Configure bugmail: https://bugzilla.mozilla.org/userprefs.cgi?tab=email ------- You are receiving this mail because: -----';

var gMoveFolder;
var gFilter; // the test filter
var gFilterList;
var gTestArray =
[
  function createFilters() {
    gFilterList = gPOP3Pump.fakeServer.getFilterList(null);
    // create a cc filter which will match the first message but not the second.
    gFilter = gFilterList.createFilter("MoveCc");
    let searchTerm = gFilter.createTerm();
    searchTerm.attrib = Ci.nsMsgSearchAttrib.CC;
    searchTerm.op = Ci.nsMsgSearchOp.Contains;
    var oldValue = searchTerm.value;
    oldValue.attrib = Ci.nsMsgSearchAttrib.CC;
    oldValue.str = "invalid@example.com";
    searchTerm.value = oldValue;
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
  function verifyFolders2() {
    do_check_eq(folderCount(gMoveFolder), 1);
    // the local inbox folder should have one message.
    do_check_eq(folderCount(localAccountUtils.inboxFolder), 1);
  },
  function verifyMessages() {
    // check MoveFolder message
    let hdrs = [];
    let keys = [];
    let enumerator = gMoveFolder.msgDatabase.EnumerateMessages();
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    keys.push(hdr.messageKey);
    hdrs.push(hdr);
    do_check_false(gMoveFolder.fetchMsgPreviewText(keys, keys.length,
                                                   false, null));
    do_check_eq(hdrs[0].getStringProperty('preview'), bugmail10_preview);
    // check inbox message
    hdrs = [];
    keys = [];
    enumerator = localAccountUtils.inboxFolder.msgDatabase.EnumerateMessages();
    hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    keys.push(hdr.messageKey);
    hdrs.push(hdr);
    do_check_false(localAccountUtils.inboxFolder
                                    .fetchMsgPreviewText(keys, keys.length,
                                                         false, null));
    do_check_eq(hdrs[0].getStringProperty('preview'), basic1_preview);
  }
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
    // Initialize pop3Pump with correct mailbox format.
    gPOP3Pump.resetPluggableStore(storeID);

    // Set the default mailbox store.
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                               storeID);

    // Make sure we're not quarantining messages
    Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);
    if (!localAccountUtils.inboxFolder)
      localAccountUtils.loadLocalMailAccount();

    gMoveFolder = localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder");
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

/*
 * This file tests that a pop3 add tag filter writes the new tag
 * into the message keywords header. It also tests marking read,
 * and flagging messages.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gFiles = ["../../../data/bugmail10", "../../../data/bugmail11"];

Services.prefs.setBoolPref("mail.server.default.leave_on_server", true);

// Currently we have two mailbox storage formats.
var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1",
];

// Map subject to previews using subject as the key.
var previews = {
  "[Bug 436880] IMAP itemDeleted and itemMoveCopyCompleted notifications quite broken":
    "Do not reply to this email. You can add comments to this bug at https://bugzilla.mozilla.org/show_bug.cgi?id=436880 -- Configure bugmail: https://bugzilla.mozilla.org/userprefs.cgi?tab=email ------- You are receiving this mail because: -----",
  "Bugzilla: confirm account creation":
    "Bugzilla has received a request to create a user account using your email address (example@example.org). To confirm that you want to create an account using that email address, visit the following link: https://bugzilla.mozilla.org/token.cgi?t=xxx",
};

var gFilter; // the test filter
var gFilterList;
var gTestArray = [
  function createFilters() {
    gFilterList = gPOP3Pump.fakeServer.getFilterList(null);
    gFilter = gFilterList.createFilter("AddKeyword");
    const searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    let tagAction = gFilter.createAction();
    tagAction.type = Ci.nsMsgFilterAction.AddTag;
    tagAction.strValue = "TheTag";
    gFilter.appendAction(tagAction);
    tagAction = gFilter.createAction();
    tagAction.type = Ci.nsMsgFilterAction.MarkRead;
    gFilter.appendAction(tagAction);
    tagAction = gFilter.createAction();
    tagAction.type = Ci.nsMsgFilterAction.MarkFlagged;
    gFilter.appendAction(tagAction);
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
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 2);

    // invalidate the inbox summary file, to be sure that we wrote the keywords
    // into the mailbox.
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

    // This statement is never reached.
    Assert.ok(false);
  },
  function verifyMessages() {
    const hdrs = [];
    const keys = [];
    for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
      keys.push(hdr.messageKey);
      hdrs.push(hdr);
    }
    Assert.ok(!localAccountUtils.inboxFolder.fetchMsgPreviewText(keys, null));
    const preview1 = hdrs[0].getStringProperty("preview");
    const preview2 = hdrs[1].getStringProperty("preview");
    Assert.equal(preview1, previews[hdrs[0].subject]);
    Assert.equal(preview2, previews[hdrs[1].subject]);
    Assert.equal(hdrs[0].getStringProperty("keywords"), "TheTag");
    Assert.equal(hdrs[1].getStringProperty("keywords"), "TheTag");
    Assert.equal(
      hdrs[0].flags,
      Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
    );
    Assert.equal(
      hdrs[1].flags,
      Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
    );
  },
];

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}

function setup_store(storeID) {
  return function _setup_store() {
    // Initialize pop3Pump with correct mailbox format.
    gPOP3Pump.resetPluggableStore(storeID);

    // Set the default mailbox store.
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);

    // Make sure we're not quarantining messages
    Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);

    if (!localAccountUtils.inboxFolder) {
      localAccountUtils.loadLocalMailAccount();
    }
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
  info("Exiting mail tests\n");
  gPOP3Pump = null;
}

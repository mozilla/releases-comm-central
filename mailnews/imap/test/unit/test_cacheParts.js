/*
 * Test bug 629738 - Parts should be cached.
 */

load("../../../resources/logHelper.js");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

var gSavedMsgFile;

var gIMAPService = Cc["@mozilla.org/messenger/messageservice;1?type=imap"]
                       .getService(Ci.nsIMsgMessageService);

var gFileName1 = "image-attach-test";
var gMsgFile1 = do_get_file("../../../data/" + gFileName1);
var gMsgId1 = "4A947F73.5030709@example.com";

var gFileName2 = "external-attach-test";
var gMsgFile2 = do_get_file("../../../data/" + gFileName2);
var gMsgId2 = "876TY.5030709@example.com";

var gMsgURL1;
var gMsgPartURL1;
var gMsgURL2;
var gMsgPartURL2;
var gUidValidity;

// We use this as a display consumer
var streamListener =
{
  _data: "",

  QueryInterface:
    XPCOMUtils.generateQI([Ci.nsIStreamListener, Ci.nsIRequestObserver]),

  // nsIRequestObserver
  onStartRequest: function(aRequest, aContext) {
  },
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    Assert.equal(aStatusCode, Cr.NS_OK);
  },

  // nsIStreamListener
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
    let scriptStream = Cc["@mozilla.org/scriptableinputstream;1"]
                         .createInstance(Ci.nsIScriptableInputStream);

    scriptStream.init(aInputStream);

    scriptStream.read(aCount);
  }
};

var tests = [
  setup,
  displayMessage1,
  displayPart1,
  displayMessage2,
  hackMetadata,
  displayPart2,
  checkCache,
  teardown
];

function* setup() {
  // No offline download, otherwise nothing is cached.
  Services.prefs.setBoolPref("mail.server.server1.offline_download", false);
  // Make sure our small attachment doesn't automatically get loaded, so
  // give it a tiny threshold.
  // XXX We can't set this pref until the fake server supports body structure.
  // Services.prefs.setIntPref("mail.imap.mime_parts_on_demand_threshold", 1);

  setupIMAPPump();

  /*
   * Ok, prelude done. Read the original messages from disk
   * (through a file URI), and add them to the Inbox.
   */
  var msgfileuri;
  msgfileuri = Services.io.newFileURI(gMsgFile1).QueryInterface(Ci.nsIFileURL);
  IMAPPump.mailbox.addMessage(new imapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, []));
  msgfileuri = Services.io.newFileURI(gMsgFile2).QueryInterface(Ci.nsIFileURL);
  IMAPPump.mailbox.addMessage(new imapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, []));

  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  yield listener.promise;
}

function* displayMessage1() {
  // We postpone creating the imap service until after we've set the prefs
  // that it reads on its startup.
  gIMAPService = Cc["@mozilla.org/messenger/messageservice;1?type=imap"]
                   .getService(Ci.nsIMsgMessageService);

  let db = IMAPPump.inbox.msgDatabase;
  let msg = db.getMsgHdrForMessageID(gMsgId1);
  gUidValidity = msg.folder.QueryInterface(Ci.nsIImapMailFolderSink).uidValidity;
  let listener = new PromiseTestUtils.PromiseUrlListener();
  let url = new Object;
  gIMAPService.DisplayMessage(IMAPPump.inbox.getUriForMsg(msg),
                              streamListener,
                              null,
                              listener,
                              null,
                              url);
  gMsgURL1 = url.value;
  yield listener.promise;
}

function* displayPart1() {
  let db = IMAPPump.inbox.msgDatabase;
  let msg = db.getMsgHdrForMessageID(gMsgId1);
  let url = new Object;
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.DisplayMessage(IMAPPump.inbox.getUriForMsg(msg)+"?part=1.2&filename=check.gif",
                              streamListener,
                              null,
                              listener,
                              null,
                              url);
  gMsgPartURL1 = url.value;
  yield listener.promise;
}

function* displayMessage2() {
  let db = IMAPPump.inbox.msgDatabase;
  let msg = db.getMsgHdrForMessageID(gMsgId2);
  let url = new Object;
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.DisplayMessage(IMAPPump.inbox.getUriForMsg(msg),
                              streamListener,
                              null,
                              listener,
                              null,
                              url);
  gMsgURL2 = url.value;
  yield listener.promise;
}

function hackMetadata() {
  // The sad story is tha the fake server doesn't support body structure, so we
  // always load all messages entirely.
  // Hack the meta data to pretend this isn't the case to force separate caching
  // of the PDF attachment.
  let extension = gUidValidity.toString(16);

  MailServices.imap
              .cacheStorage
              .asyncOpenURI(gMsgURL2, extension, Ci.nsICacheStorage.OPEN_NORMALLY,
    {
      onCacheEntryAvailable: function(cacheEntry, isNew, appCache, status) {
        Assert.equal(status, Cr.NS_OK);
        cacheEntry.setMetaDataElement("ContentModified", "Modified View As Link");
      },
      onCacheEntryCheck: function(cacheEntry, appCache) {
        return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
      }
    }
  );
}

function* displayPart2() {
  let db = IMAPPump.inbox.msgDatabase;
  let msg = db.getMsgHdrForMessageID(gMsgId2);
  let url = new Object;
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.DisplayMessage(IMAPPump.inbox.getUriForMsg(msg)+"?part=1.2&filename=check.pdf",
                              streamListener,
                              null,
                              listener,
                              null,
                              url);
  gMsgPartURL2 = url.value;
  yield listener.promise;
}

function checkCache() {
  let extension = gUidValidity.toString(16);
  // Entire message should be in the cache.
  Assert.ok(
    MailServices.imap.cacheStorage.exists(gMsgURL1, extension)
  );
  // Part of inline message should NOT be cached separately.
  Assert.ok(
    !MailServices.imap.cacheStorage.exists(gMsgPartURL1, extension)
  );

  // Message which isn't cached entirely due to non-inline parts should cache
  // parts separately.

  // Message should be in the cache.
  Assert.ok(
    MailServices.imap.cacheStorage.exists(gMsgURL2, extension)
  );
  // Non-inline part should be cached separately.
  Assert.ok(
    MailServices.imap.cacheStorage.exists(gMsgPartURL2, extension)
  );
}

function teardown() {
  teardownIMAPPump();
}

function run_test() {
  tests.forEach(add_task);
  run_next_test();
}

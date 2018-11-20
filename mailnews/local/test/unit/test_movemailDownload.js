/**
 * The intent of this file is to test that movemail download code
 * works correctly.
 */
ChromeUtils.import("resource:///modules/MailServices.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1"
];

var testSubjects = ["[Bug 397009] A filter will let me tag, but not untag",
                    "Hello, did you receive my bugmail?",
                    "[Bug 655578] list-id filter broken"];

var gMsgHdrs = [];
var gHdrIndex = 0;

// the movemail spool dir file is these three files
// concatenated together.

var gFiles = ["../../../data/bugmail1",
              "../../../data/draft1",
              "../../../data/bugmail19"];

var gMoveMailInbox;

function setup(storeID, aHostName) {
  return function _setup() {
    localAccountUtils.loadLocalMailAccount(storeID);
    let movemailServer =
      MailServices.accounts.createIncomingServer("", aHostName, "movemail");
    let workingDir = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
    let workingDirFile = workingDir.clone();
    let fullPath = workingDirFile.path + "/data/movemailspool";
    workingDirFile.initWithPath(fullPath);
    // movemail truncates spool file, so make a copy, and use that
    workingDirFile.copyTo(null, "movemailspool-copy");
    fullPath += "-copy";
    dump("full path = " + fullPath + "\n");
    movemailServer.setCharValue("spoolDir", fullPath);
    movemailServer.QueryInterface(Ci.nsILocalMailIncomingServer);
    movemailServer.getNewMail(null, null, null);
    gMoveMailInbox = movemailServer.rootFolder.getChildNamed("INBOX");
  }
}

var gTestArray = [
  function continueTest() {
    // Clear the gMsgHdrs array.
    gMsgHdrs = [];
    // get message headers for the inbox folder
    let enumerator = gMoveMailInbox.msgDatabase.EnumerateMessages();
    var msgCount = 0;
    let hdr;
    while (enumerator.hasMoreElements()) {
      let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      gMsgHdrs.push(hdr);
      Assert.equal(hdr.subject, testSubjects[msgCount++]);
    }
    Assert.equal(msgCount, 3);
  },
  async function streamMessages() {
    for (let msgHdr of gMsgHdrs)
      await streamNextMessage(msgHdr);
  }
];

function run_test()
{
  let hostName = "movemail";
  for (let index = 0; index < localAccountUtils.pluggableStores.length; index++) {
    add_task(setup(localAccountUtils.pluggableStores[index],
                   hostName + "-" + index));
    gTestArray.forEach(x => add_task(x));
  }

  run_next_test();
}

var streamNextMessage = async function (aMsgHdr) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
  let msgURI = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  dump("streaming msg " + msgURI + " store token = " +
       aMsgHdr.getStringProperty("storeToken"));
  let msgServ = messenger.messageServiceFromURI(msgURI);
  let streamListener = new PromiseTestUtils.PromiseStreamListener();
  msgServ.streamMessage(msgURI, streamListener, null, null, false, "", true);
  let data = await streamListener.promise;
  Assert.ok(data.startsWith("From "));
};

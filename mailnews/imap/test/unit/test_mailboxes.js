/**
 * Tests basic mailbox handling of IMAP, like discovery, rename and empty folder.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

// The following folder names are not pure ASCII and will be MUTF-7 encoded.
const folderName1 = "I18N box\u00E1"; // I18N boxá
const folderName2 = "test \u00E4"; // test ä

function* setup() {
  setupIMAPPump();

  IMAPPump.daemon.createMailbox(folderName1, { subscribed: true });
  IMAPPump.daemon.createMailbox("Unsubscribed box");
  // Create an all upper case trash folder name to make sure
  // we handle special folder names case-insensitively.
  IMAPPump.daemon.createMailbox("TRASH", { subscribed: true });

  // Get the server list...
  IMAPPump.server.performTest("LIST");

  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

var tests = [
  setup,
  function* checkDiscovery() {
    dump("in check discovery\n");
    let rootFolder = IMAPPump.incomingServer.rootFolder;
    // Check that we've subscribed to the boxes returned by LSUB. We also get
    // checking of proper i18n in mailboxes for free here.
    Assert.ok(rootFolder.containsChildNamed("Inbox"));
    Assert.ok(rootFolder.containsChildNamed("TRASH"));
    // Make sure we haven't created an extra "Trash" folder.
    let trashes = rootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Trash);
    Assert.equal(trashes.length, 1);
    Assert.equal(rootFolder.numSubFolders, 3);
    Assert.ok(rootFolder.containsChildNamed(folderName1));
    // This is not a subscribed box, so we shouldn't be subscribing to it.
    Assert.ok(!rootFolder.containsChildNamed("Unsubscribed box"));

    let i18nChild = rootFolder.getChildNamed(folderName1);

    MailServices.imap.renameLeaf(
      i18nChild,
      folderName2,
      asyncUrlListener,
      null
    );
    yield false;
  },
  function* checkRename() {
    let rootFolder = IMAPPump.incomingServer.rootFolder;
    Assert.ok(rootFolder.containsChildNamed(folderName2));
    let newChild = rootFolder
      .getChildNamed(folderName2)
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    newChild.updateFolderWithListener(null, asyncUrlListener);
    yield false;
  },
  function checkEmptyFolder() {
    try {
      let serverSink = IMAPPump.server.QueryInterface(Ci.nsIImapServerSink);
      serverSink.possibleImapMailbox("/", "/", 0);
    } catch (ex) {
      // we expect this to fail, but not crash or assert.
    }
  },
  teardown,
];

function teardown() {
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}

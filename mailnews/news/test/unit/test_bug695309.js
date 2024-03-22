/* Tests the connection mayhem found by bug 695309 */

// The full bug requires several things to fall into place:
// 1. Cause the connections to timeout, while keeping them in the cache.
// 2. Enqueue enough requests to cause things to be placed in the pending queue.
// 3. Commands try to run but die instead.
// 4. Enqueue more requests to open up new connections.
// 5. When loading, the connection ends up pulling somebody from the queue and
//    ends up treating the response for the prior command as the current
//    response.
// 6. This causes, in particular, GROUP to read the logon string as the response
//    (where sprintf clears everything to 0), and AUTHINFO to think credentials
//    are wrong. The bug's description is then caused by the next read seeing
//    a large number of (not really) new messages.
// For the purposes of this test, we read enough to see if the group command is
// being misread or not, as it is complicated enough.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var daemon, localserver, server;
var highWater = 0;

add_setup(async function () {
  daemon = setupNNTPDaemon();
  server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);

  // Bug 1050840:
  // Check if invalid value of the max_cached_connections pref
  // is properly folded into a sane value.
  localserver.maximumConnectionsNumber = -5;
  Assert.equal(localserver.maximumConnectionsNumber, 1);

  localserver.maximumConnectionsNumber = 0;
  Assert.equal(localserver.maximumConnectionsNumber, 2);

  localserver.maximumConnectionsNumber = 2;
});

add_task(async function test_newMsgs() {
  // Start by initializing the folder, and mark some messages as read.
  const folder = localserver.rootFolder.getChildNamed("test.filter");
  Assert.equal(folder.getTotalMessages(false), 0);
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(null, asyncUrlListener);
  await asyncUrlListener.promise;
  // Do another folder to use up both connections
  localserver.rootFolder
    .getChildNamed("test.subscribe.simple")
    .getNewMessages(null, asyncUrlListener);
  await asyncUrlListener.promise;
  folder.QueryInterface(Ci.nsIMsgNewsFolder).setReadSetFromStr("1-3");
  Assert.equal(folder.getTotalMessages(false) - folder.getNumUnread(false), 3);
  highWater = folder.getTotalMessages(false);
  Assert.equal(folder.msgDatabase.dBFolderInfo.highWater, highWater);
});

add_task(async function trigger_bug() {
  // Kill the connection and start it up again.
  server.stop();
  server.start();

  // Get new messages for all folders. Once we've seen one folder, trigger a
  // load of the folder in question. This second load should, if the bug is
  // present, be overwritten with one from the load queue that causes the
  // confusion. It then loads it again, and should (before the patch that fixes
  // this) read the 200 logon instead of the 211 group.
  const testFolder = localserver.rootFolder.getChildNamed("test.filter");
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  const promiseFolderEvent = function (folder, event) {
    return new Promise(resolve => {
      const folderListener = {
        QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
        onFolderEvent(aEventFolder, aEvent) {
          if (
            aEvent == "FolderLoaded" &&
            aEventFolder.prettyName == "test.subscribe.simple"
          ) {
            aEventFolder.getNewMessages(null, asyncUrlListener);
            return;
          }

          if (folder === aEventFolder && event == aEvent) {
            MailServices.mailSession.RemoveFolderListener(folderListener);
            resolve();
          }
        },
      };
      MailServices.mailSession.AddFolderListener(
        folderListener,
        Ci.nsIFolderListener.event
      );
    });
  };
  const folderLoadedPromise = promiseFolderEvent(testFolder, "FolderLoaded");

  localserver.performExpand(null);

  // Wait for test.subscribe.simple to load. That will trigger getNewMessages.
  await folderLoadedPromise;
  // Wait for the new messages to be loaded.
  await asyncUrlListener.promise;

  Assert.equal(testFolder.msgDatabase.dBFolderInfo.highWater, highWater);
});

add_task(async function cleanUp() {
  localserver.closeCachedConnections();
});

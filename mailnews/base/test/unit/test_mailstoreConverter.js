/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
ChromeUtils.import("resource://gre/modules/osfile.jsm");
ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");
ChromeUtils.import("resource:///modules/mailstoreConverter.jsm");
ChromeUtils.import("resource://gre/modules/Log.jsm");

var log = Log.repository.getLogger("MailStoreConverter");
Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  add_task(async function() {
    await doMboxTest("test1", "../../../data/mbox_modern", 2);
    await doMboxTest("test2", "../../../data/mbox_mboxrd", 2);
    await doMboxTest("test3", "../../../data/mbox_unquoted", 2);
    // Ideas for more tests:
    // - check a really big mbox
    // - check with really huge message (larger than one chunk)
    // - check mbox with "From " line on chunk boundary
    // - add tests for maildir->mbox conversion
    // - check that round-trip conversion preserves messages
    // - check that conversions preserve message body (ie that the
    //   "From " line escaping scheme is reversable)
  });

  run_next_test();
}

/**
 * Helper to create a server, account and inbox, and install an
 * mbox file.
 * @return {nsIMsgIncomingServer} a server.
 */
function setupServer(srvName, mboxFilename) {
  // {nsIMsgIncomingServer} pop server for the test.
  let server = MailServices.accounts.createIncomingServer(srvName,"localhost",
                                                          "pop3");
  let account= MailServices.accounts.createAccount();
  account.incomingServer = server;
  server.QueryInterface(Ci.nsIPop3IncomingServer);
  server.valid = true;

  let inbox = account.incomingServer.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  // install the mbox file
  let mboxFile = do_get_file(mboxFilename);
  mboxFile.copyTo( inbox.filePath.parent, inbox.filePath.leafName)

  // TODO: is there some way to make folder rescan the mbox?
  // We don't need it for this, but would be nice to do things properly.
  return server;
}


/**
 * Perform an mbox->maildir conversion test.
 *
 * @param {string} srvName - A unique server name to use for the test.
 * @param {string} mboxFilename - mbox file to install and convert.
 * @param {number} expectCnt - Number of messages expected.
 * @return {nsIMsgIncomingServer} a server.
 */
async function doMboxTest(srvName, mboxFilename, expectCnt) {
  // set up an account+server+inbox and copy in the test mbox file
  let server = setupServer(srvName, mboxFilename);

  let mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + server.key + ".storeContractID");

  let aVal = await convertMailStoreTo(
    mailstoreContractId, server, new EventTarget());
  // NOTE: convertMailStoreTo() will suppress exceptions in it's
  // worker, which makes unittest failures trickier to read...

  let originalRootFolder = server.rootFolder.filePath;

  // Converted. Now find resulting Inbox/cur directory so
  // we can count the messages there.

  let inbox = server.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  // NOTE: the conversion updates the path of the root folder,
  // but _not_ the path of the inbox...
  // Ideally, we'd just use inbox.filePath here, but
  // instead we'll have compose the path manually.

  let curDir = server.rootFolder.filePath;
  curDir.append(inbox.filePath.leafName);
  curDir.append("cur");

  // Sanity check.
  Assert.ok(curDir.isDirectory(), "'cur' directory created" );

  // Check number of messages in Inbox/cur is what we expect.
  let cnt = 0;
  let it = curDir.directoryEntries;
  while (it.hasMoreElements()) {
    let curContent = it.getNext();
    cnt++;
  }

  Assert.equal(cnt, expectCnt, "expected number of messages (" + mboxFilename + ")");
}


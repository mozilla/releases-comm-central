/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that appending a message to a UIDPLUS server only reports a message key
 * when the server actually returned an APPENDUID response code.
 */

let omitAppendUid = false;
let daemon;
let server;
let incomingServer;
let folder;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  daemon = new ImapDaemon();
  server = makeServer(daemon, "RFC4315", {
    APPEND(args) {
      if (omitAppendUid) {
        return this._preRFC4315APPEND(args);
      }
      return IMAP_RFC4315_extension.APPEND.call(this, args);
    },
  });
  incomingServer = createLocalIMAPServer(server.port);

  const folderAdded = PromiseTestUtils.promiseFolderAdded("Sent");
  incomingServer.rootFolder.createSubfolder("Sent", null);
  await folderAdded;
  folder = incomingServer.rootFolder
    .getChildNamed("Sent")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores");
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
    server.stop();
  });
});

async function appendMessage() {
  const keys = [];
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    setMessageKey(key) {
      keys.push(key);
    },
  });
  MailServices.copy.copyFileMessage(
    do_get_file("../../../data/bugmail10"),
    folder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;
  return keys;
}

add_task(async function testAppendUid() {
  omitAppendUid = false;
  const keys = await appendMessage();

  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  folder.updateFolderWithListener(null, urlListener);
  await urlListener.promise;

  const msgHdrs = [...folder.msgDatabase.enumerateMessages()];
  Assert.equal(msgHdrs.length, 1, "The message should be in the folder once");
  Assert.deepEqual(
    keys,
    [msgHdrs[0].messageKey],
    "The message key should be the one for the APPENDUID"
  );
});

add_task(async function testMissingAppendUid() {
  omitAppendUid = true;
  const keys = await appendMessage();
  Assert.deepEqual(
    keys,
    [],
    "No message key should be reported without an APPENDUID"
  );
});

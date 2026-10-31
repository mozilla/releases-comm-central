/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the key of a message appended to a UIDPLUS server comes from the
 * APPENDUID response code, or from searching for its Message-ID if the server
 * didn't return one.
 */

let omitAppendUid = false;
let failSearch = false;
let messageCount = 0;
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
    SEARCH(args) {
      if (
        args.join(" ").toUpperCase().startsWith("UNDELETED HEADER MESSAGE-ID")
      ) {
        if (failSearch) {
          return "NO SEARCH failed";
        }
        // Like real servers, match any Message-ID containing the string.
        const searchString = args.at(-1);
        const uids = this._selectedMailbox._messages
          .filter(
            message =>
              !message.flags.includes("\\Deleted") &&
              message
                .getText()
                .match(/^Message-ID: (.*)$/im)?.[1]
                .includes(searchString)
          )
          .map(message => message.uid);
        return `* SEARCH ${uids.join(" ")}\0OK SEARCH COMPLETED`;
      }
      return "BAD not here yet";
    },
  });
  incomingServer = createLocalIMAPServer(server.port);

  const folderAdded = PromiseTestUtils.promiseFolderAdded("Sent");
  incomingServer.rootFolder.createSubfolder("Sent");
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

/**
 * Append a message to the folder.
 *
 * @param {string} messageId - The Message-ID of the message, with brackets.
 * @param {object} [options]
 * @param {boolean} [options.isDraft=false] - If the message should be saved as
 *   draft.
 * @param {string} [options.reportedId=messageId] - The Message-ID reported by
 *   the copy listener.
 * @returns {Promise<{keys: nsMsgKey[], subject: string}>} The message keys
 *   reported for the message, and its unique subject.
 */
async function appendMessage(
  messageId,
  { isDraft = false, reportedId = messageId } = {}
) {
  const path = PathUtils.join(
    PathUtils.profileDir,
    `append${++messageCount}.eml`
  );
  await IOUtils.writeUTF8(
    path,
    [
      "From: sender@example.invalid",
      "To: recipient@example.invalid",
      `Subject: Message ${messageCount}`,
      `Message-ID: ${messageId}`,
      "Date: Thu, 22 Oct 2026 10:00:00 +0000",
      "",
      "Hello",
      "",
    ].join("\r\n")
  );

  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    getMessageId() {
      return reportedId;
    },
  });
  MailServices.copy.copyFileMessage(
    await IOUtils.getFile(path),
    folder,
    null,
    isDraft,
    0,
    "",
    copyListener,
    false
  );
  const { messageKeys } = await copyListener.promise;
  return { keys: messageKeys, subject: `Message ${messageCount}` };
}

/**
 * Check that the key reported for an appended message is the key of that
 * message once its header has been downloaded from the server.
 *
 * @param {object} appended - The result of appendMessage().
 * @param {nsMsgKey[]} appended.keys
 * @param {string} appended.subject
 * @param {string} message - The assertion message.
 */
async function assertAppendedMessageKey({ keys, subject }, message) {
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  folder.updateFolderWithListener(false, urlListener);
  await urlListener.promise;

  const msgHdrs = [...folder.msgDatabase.enumerateMessages()].filter(
    msgHdr => msgHdr.subject == subject
  );
  Assert.equal(msgHdrs.length, 1, "The message should be in the folder once");
  Assert.deepEqual(keys, [msgHdrs[0].messageKey], message);
}

add_task(async function testAppendUid() {
  omitAppendUid = false;
  const appended = await appendMessage("<appenduid@example.invalid>");
  await assertAppendedMessageKey(
    appended,
    "The message key should be the one for the APPENDUID"
  );
});

add_task(async function testMissingAppendUid() {
  omitAppendUid = true;
  const appended = await appendMessage("<search@example.invalid>");
  await assertAppendedMessageKey(
    appended,
    "The message key should be the one for the UID found by Message-ID"
  );
});

add_task(async function testMissingAppendUidDraft() {
  omitAppendUid = true;
  const appended = await appendMessage("<draft@example.invalid>", {
    isDraft: true,
  });
  await assertAppendedMessageKey(
    appended,
    "The draft's message key should be the one for the UID found by Message-ID"
  );
});

add_task(async function testMissingAppendUidSpecialChars() {
  omitAppendUid = true;
  const appended = await appendMessage('<"odd{id}\\\\"@example.invalid>');
  await assertAppendedMessageKey(
    appended,
    "A Message-ID with IMAP special characters should be found"
  );
});

add_task(async function testMissingAppendUidDuplicate() {
  omitAppendUid = true;
  const messageId = "<duplicate@example.invalid>";
  await appendMessage(messageId);
  const appended = await appendMessage(messageId);
  await assertAppendedMessageKey(
    appended,
    "The newest message with the Message-ID should be the message key"
  );
});

add_task(async function testMissingAppendUidNotFound() {
  omitAppendUid = true;
  const { keys } = await appendMessage("<stored@example.invalid>", {
    reportedId: "<not-found@example.invalid>",
  });
  Assert.deepEqual(
    keys,
    [],
    "No message key should be reported if the message can't be found"
  );
});

add_task(async function testMissingAppendUidSubstring() {
  omitAppendUid = true;
  await appendMessage("<xsubstring@example.invalid>");
  const { keys } = await appendMessage("<stored2@example.invalid>", {
    reportedId: "<substring@example.invalid>",
  });
  Assert.deepEqual(
    keys,
    [],
    "A Message-ID only containing the searched one should not match"
  );
});

add_task(async function testMissingAppendUidSearchFails() {
  omitAppendUid = true;
  failSearch = true;
  const uid = daemon.getMailbox("Sent").uidnext;
  const { keys } = await appendMessage("<search-fails@example.invalid>");
  failSearch = false;
  Assert.deepEqual(
    keys,
    [],
    "No message key should be reported if the search fails"
  );
  Assert.ok(
    daemon.getMailbox("Sent")._messages.some(message => message.uid == uid),
    "The message should still have been appended"
  );
});

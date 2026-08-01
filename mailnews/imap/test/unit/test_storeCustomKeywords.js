/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const VALID_TAG_KEY = "validtag";
const MALFORMED_TAG_KEY = "invalid)";
// Thunderbird formerly derived non-ASCII tag keys using modified UTF-7 and
// lowercased the result.
const LEGACY_TAG_KEY = "&aok-";
// The fake server normalizes keyword capitalization before storing it.
const NORMALIZED_VALID_TAG_KEY = "Validtag";
const NORMALIZED_LEGACY_TAG_KEY = "&Aok-";

var gServerMessageForMixedKeywords;
var gServerMessageForKeywordAdd;
var gServerMessageForKeywordRemove;
var gSynthMessageForMixedKeywords;
var gSynthMessageForKeywordAdd;
var gSynthMessageForKeywordRemove;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  const messageGenerator = new MessageGenerator();
  gSynthMessageForMixedKeywords = messageGenerator.makeMessage();
  gSynthMessageForKeywordAdd = messageGenerator.makeMessage();
  gSynthMessageForKeywordRemove = messageGenerator.makeMessage();

  gServerMessageForMixedKeywords = addMessageToServer(
    gSynthMessageForMixedKeywords,
    []
  );
  gServerMessageForKeywordAdd = addMessageToServer(
    gSynthMessageForKeywordAdd,
    []
  );
  gServerMessageForKeywordRemove = addMessageToServer(
    gSynthMessageForKeywordRemove,
    []
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function testStoreValidKeywordAlongsideMalformedKeyword() {
  const header = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessageForMixedKeywords.messageId
  );

  try {
    await storeCustomKeywords(
      header,
      `${VALID_TAG_KEY} ${MALFORMED_TAG_KEY}`,
      ""
    );
  } catch {
    // Check the server state even if it rejected the malformed batch.
  }

  Assert.ok(
    gServerMessageForMixedKeywords.flags.includes(NORMALIZED_VALID_TAG_KEY),
    "A valid keyword should be stored when another keyword is malformed"
  );
});

add_task(async function testStoreLegacyCustomKeyword() {
  const addHeader = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessageForKeywordAdd.messageId
  );
  const removeHeader = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessageForKeywordRemove.messageId
  );

  await storeCustomKeywords(addHeader, LEGACY_TAG_KEY, "");
  gServerMessageForKeywordRemove.setFlag(NORMALIZED_LEGACY_TAG_KEY);
  await storeCustomKeywords(removeHeader, "", LEGACY_TAG_KEY);

  Assert.deepEqual(
    {
      added: gServerMessageForKeywordAdd.flags.includes(
        NORMALIZED_LEGACY_TAG_KEY
      ),
      removed: !gServerMessageForKeywordRemove.flags.includes(
        NORMALIZED_LEGACY_TAG_KEY
      ),
    },
    { added: true, removed: true },
    "A legacy modified UTF-7 keyword should be added and removed"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});

function addMessageToServer(synthMessage, flags) {
  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(synthMessage.toMessageString())
  );
  const message = new ImapMessage(
    msgURI.spec,
    IMAPPump.mailbox.uidnext++,
    flags
  );
  IMAPPump.mailbox.addMessage(message);
  return message;
}

async function storeCustomKeywords(header, flagsToAdd, flagsToRemove) {
  const uri = IMAPPump.inbox.storeCustomKeywords(
    null,
    flagsToAdd,
    flagsToRemove,
    [header.messageKey]
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  uri.RegisterListener(listener);
  await listener.promise;
}

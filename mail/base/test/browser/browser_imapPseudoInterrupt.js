/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an in-flight imap message fetch is only pseudo-interrupted on
 * behalf of the consumer that started it.
 *
 * nsIImapIncomingServer.pseudoInterruptMsgLoad() abandons a download the user
 * has navigated away from. It is scoped by load group, so that one message
 * pane cannot cut short a fetch belonging to another; a null consumer
 * interrupts whoever is fetching, which is what deleting the message wants.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

// Small chunks so a large body takes many fetches, widening the window in
// which the download can be interrupted.
const CHUNK_SIZE = 4000;
const CHUNK_THRESHOLD = 2000;
const BODY_LINE =
  "This is a line of the test message body, padding it out.\r\n";
const BODY_LINES = 1200; // ~70 KB.

const SUBJECTS = [
  "null-consumer",
  "own-pane",
  "other-pane",
  "delete-other",
  "delete-self",
];

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;

let imapServer, imapFolder, imapServerInterface;
let messageService;
let otherConsumer;

/**
 * The header of the message set aside for the named test.
 *
 * @param {string} subject
 * @returns {nsIMsgDBHdr}
 */
function hdrFor(subject) {
  const hdr = [...imapFolder.messages].find(m => m.subject == subject);
  Assert.ok(!!hdr, `message "${subject}" should exist`);
  return hdr;
}

/**
 * The docshell that the 3-pane's message pane fetches into.
 */
function messagePaneDocShell() {
  return about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
    .docShell;
}

/**
 * Start a display fetch of `msgHdr` into the 3-pane's message pane, and once
 * it is actually running, interrupt it on behalf of `consumer`.
 *
 * @param {nsIMsgDBHdr} msgHdr - The message to load.
 * @param {?nsISupports} consumer - Passed to pseudoInterruptMsgLoad().
 * @param {nsMsgKey[]} [messageKeys=[]] - Passed to pseudoInterruptMsgLoad().
 * @returns {object} `{ interrupted, status }` - what
 *   pseudoInterruptMsgLoad() returned, and how the load ended.
 */
async function loadAndInterrupt(msgHdr, consumer, messageKeys = []) {
  const browser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

  let startedAction, onStarted, onStopped;
  const started = new Promise(resolve => (onStarted = resolve));
  const stopped = new Promise(resolve => (onStopped = resolve));
  const urlListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),
    OnStartRunningUrl(url) {
      startedAction = url.QueryInterface(Ci.nsIImapUrl).imapAction;
      onStarted();
    },
    OnStopRunningUrl(url, status) {
      onStopped(status);
    },
  };

  messageService.loadMessage(
    imapFolder.getUriForMsg(msgHdr),
    browser.docShell,
    true,
    urlListener,
    false
  );

  await started;
  const interrupted = imapServerInterface.pseudoInterruptMsgLoad(
    imapFolder,
    consumer,
    messageKeys
  );
  const status = await stopped;
  return { interrupted, status, startedAction };
}

add_setup(async function () {
  // A display fetch is only interruptible when it is a real fetch rather than
  // a peek, which means the message must be marked read on display with no
  // delay.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.mark_message_read.auto", true],
      ["mailnews.mark_message_read.delay", false],
      ["mail.server.default.fetch_by_chunks", true],
      ["mail.imap.chunk_size", CHUNK_SIZE],
      ["mail.imap.min_chunk_size_threshold", CHUNK_THRESHOLD],
      ["mail.imap.chunk_add", 0],
    ],
  });

  imapServer = new IMAPServer();

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  imapServerInterface = imapAccount.incomingServer.QueryInterface(
    Ci.nsIImapIncomingServer
  );
  imapFolder = imapAccount.incomingServer.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox)
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  // A message per test, because a download that runs to completion is stored
  // offline and loading that message again would not go to the server at all.
  const generator = new MessageGenerator();
  const body = BODY_LINE.repeat(BODY_LINES);
  await imapServer.addMessages(
    imapFolder,
    SUBJECTS.map(subject => generator.makeMessage({ subject, body: { body } }))
  );

  about3Pane.displayFolder(imapFolder);

  // Select a message, so the message pane is shown. A fetch into a hidden
  // pane is forced to a peek, which is never interruptible.
  about3Pane.threadTree.selectedIndex = 0;
  await TestUtils.waitForCondition(
    () =>
      about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser().docShell
        ?.browsingContext?.isActive,
    "waiting for the message pane to become active"
  );

  messageService = MailServices.messageServiceFromURI("imap-message://");

  // Something that is not the message pane doing the fetching, standing in
  // for the other window's pane in the bug.
  otherConsumer = Cc["@mozilla.org/network/load-group;1"].createInstance(
    Ci.nsILoadGroup
  );

  registerCleanupFunction(async () => {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

/**
 * Control: a null consumer interrupts whatever is fetching. If this fails,
 * there is no interruptible fetch running at all and the tests below would
 * succeed for the wrong reason.
 */
add_task(async function nullConsumerInterrupts() {
  const hdr = hdrFor("null-consumer");
  const { interrupted } = await loadAndInterrupt(hdr, null);

  Assert.ok(interrupted, "a null consumer should interrupt the fetch");
});

/**
 * Control: the pane doing the fetching can interrupt itself. Without this
 * passing, the regression test below would succeed for the wrong reason.
 */
add_task(async function ownPaneCanInterrupt() {
  const hdr = hdrFor("own-pane");
  const { interrupted } = await loadAndInterrupt(hdr, messagePaneDocShell());

  Assert.ok(
    interrupted,
    "a fetch should be interruptible by the pane that started it"
  );
});

/**
 * Regression test for the bug: another pane selecting a message must not cut
 * short this pane's download.
 */
add_task(async function otherPaneDoesNotInterrupt() {
  const hdr = hdrFor("other-pane");
  const { interrupted, status } = await loadAndInterrupt(hdr, otherConsumer);

  Assert.ok(
    !interrupted,
    "a fetch belonging to another pane should be left alone"
  );
  Assert.equal(status, Cr.NS_OK, "the download should have run to completion");
});

/**
 * Deleting some other message must not cut short a download, even though a
 * delete interrupts regardless of which pane is doing the downloading.
 */
add_task(async function deletingAnotherMessageDoesNotInterrupt() {
  const hdr = hdrFor("delete-other");
  const { interrupted, status } = await loadAndInterrupt(hdr, null, [
    hdrFor("delete-self").messageKey,
  ]);

  Assert.ok(
    !interrupted,
    "a download of a message that is not being deleted should be left alone"
  );
  Assert.equal(status, Cr.NS_OK, "the download should have run to completion");
});

/**
 * Deleting the message being downloaded does interrupt it.
 */
add_task(async function deletingTheFetchedMessageInterrupts() {
  const hdr = hdrFor("delete-self");
  const { interrupted } = await loadAndInterrupt(hdr, null, [hdr.messageKey]);

  Assert.ok(
    interrupted,
    "deleting the message being downloaded should interrupt it"
  );
});

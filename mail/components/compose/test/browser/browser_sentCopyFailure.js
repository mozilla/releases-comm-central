/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests recovery from asynchronous failures to copy messages to IMAP Sent and
 * Drafts folders.
 */

let imapServer;
let localAccount;
let smtpAccount;
let smtpIdentity;
let smtpOutgoingServer;

/**
 * Replace the prompt service with a recovery-prompt handler.
 *
 * @param {DOMWindow} composeWindow
 * @param {number} buttonPressed
 * @param {Function} [onPrompt]
 * @returns {object}
 */
function mockRecoveryPrompt(composeWindow, buttonPressed, onPrompt) {
  const originalPrompt = Services.prompt;
  const promptCalled = Promise.withResolvers();
  const state = { count: 0, hadOpenComposeParent: true };
  Services.prompt = {
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
    confirmEx(parentWindow) {
      state.count++;
      state.hadOpenComposeParent &&=
        parentWindow == composeWindow && !composeWindow.closed;
      onPrompt?.();
      promptCalled.resolve();
      return buttonPressed;
    },
  };
  return {
    promptCalled: promptCalled.promise,
    restore() {
      Services.prompt = originalPrompt;
    },
    state,
  };
}

/**
 * Wait for a compose window send/save operation to finish.
 *
 * @param {DOMWindow} composeWindow
 * @returns {Promise}
 */
function progressStopPromise(composeWindow) {
  return TestUtils.topicObserved(
    "mail:composeSendProgressStop",
    subject => subject.wrappedJSObject.composeWindow == composeWindow
  );
}

add_setup(async function () {
  await addLoginInfo("imap://test.test", "user", "password");
  await addLoginInfo("smtp://test.test", "user", "password");

  [imapServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.smtp.plain,
  ]);
  imapServer.daemon.createMailbox("Sent", {
    flags: ["\\Sent"],
    subscribed: true,
  });

  localAccount = MailServices.accounts.createLocalMailAccount();
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } =
    createSMTPAccount("imap"));
  smtpIdentity.doFcc = true;

  const incomingServer = smtpAccount.incomingServer;
  incomingServer.performBiff(window.msgWindow);
  await TestUtils.waitForCondition(
    () => incomingServer.rootFolder.containsChildNamed("Sent"),
    "waiting for the Sent folder to synchronise"
  );
  smtpIdentity.fccFolderURI = incomingServer.serverURI + "/Sent";

  registerCleanupFunction(async function () {
    imapServer.daemon.commandToFail = "";
    incomingServer.closeCachedConnections();
    smtpOutgoingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(localAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function testSentCopyFailureOffersRecovery() {
  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const composeClosed = BrowserTestUtils.domWindowClosed(composeWindow);

  imapServer.daemon.commandToFail = "APPEND";
  const prompt = mockRecoveryPrompt(composeWindow, 1); // Don't Save.

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-send"),
      {},
      composeWindow
    );
    await Promise.all([prompt.promptCalled, composeClosed]);
  } finally {
    prompt.restore();
    imapServer.daemon.commandToFail = "";
  }

  Assert.ok(
    prompt.state.hadOpenComposeParent,
    "the recovery prompt should have an open compose parent"
  );
  Assert.equal(prompt.state.count, 1, "one recovery prompt should be shown");
});

add_task(async function testRetryImapSentCopy() {
  const sentMailbox = imapServer.daemon.getMailbox("Sent");
  const messageCount = sentMailbox._messages.length;
  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const composeClosed = BrowserTestUtils.domWindowClosed(composeWindow);

  imapServer.daemon.commandToFail = "APPEND";
  const prompt = mockRecoveryPrompt(composeWindow, 0, () => {
    imapServer.daemon.commandToFail = "";
  });

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-send"),
      {},
      composeWindow
    );
    await Promise.all([prompt.promptCalled, composeClosed]);
  } finally {
    prompt.restore();
    imapServer.daemon.commandToFail = "";
  }

  Assert.ok(
    prompt.state.hadOpenComposeParent,
    "the retry prompt should have an open compose parent"
  );
  Assert.equal(prompt.state.count, 1, "one retry prompt should be shown");
  Assert.equal(
    sentMailbox._messages.length,
    messageCount + 1,
    "retry should save one message to the IMAP Sent folder"
  );
});

add_task(async function testSaveImapSentCopyLocally() {
  const localRoot = MailServices.accounts.localFoldersServer.rootMsgFolder;
  const fallbackName = `Sent-${smtpAccount.incomingServer.prettyName}`;
  const messageCount = localRoot.containsChildNamed(fallbackName)
    ? localRoot.getChildNamed(fallbackName).getTotalMessages(false)
    : 0;
  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const composeClosed = BrowserTestUtils.domWindowClosed(composeWindow);

  imapServer.daemon.commandToFail = "APPEND";
  const prompt = mockRecoveryPrompt(composeWindow, 2); // Save locally.

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-send"),
      {},
      composeWindow
    );
    await Promise.all([prompt.promptCalled, composeClosed]);
  } finally {
    prompt.restore();
    imapServer.daemon.commandToFail = "";
  }

  Assert.ok(
    prompt.state.hadOpenComposeParent,
    "the local-save prompt should have an open compose parent"
  );
  Assert.equal(prompt.state.count, 1, "one local-save prompt should be shown");
  Assert.ok(
    localRoot.containsChildNamed(fallbackName),
    "the local fallback folder should be created"
  );
  Assert.equal(
    localRoot.getChildNamed(fallbackName).getTotalMessages(false),
    messageCount + 1,
    "the message should be saved to the local fallback folder"
  );
});

add_task(async function testImapDraftCreationFailureUsesLocalFolder() {
  const localRoot = MailServices.accounts.localFoldersServer.rootMsgFolder;
  const messageCount = localRoot.containsChildNamed("Drafts")
    ? localRoot.getChildNamed("Drafts").getTotalMessages(false)
    : 0;
  Assert.equal(
    imapServer.daemon.getMailbox("Drafts"),
    null,
    "the IMAP Drafts folder should not exist yet"
  );
  smtpIdentity.draftsFolderURI =
    smtpAccount.incomingServer.serverURI + "/Drafts";

  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const progressStopped = progressStopPromise(composeWindow);
  imapServer.daemon.commandToFail = "CREATE";
  const prompt = mockRecoveryPrompt(composeWindow, 1); // Don't Save if asked.

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-save"),
      {},
      composeWindow
    );
    await progressStopped;
  } finally {
    prompt.restore();
    imapServer.daemon.commandToFail = "";
  }

  Assert.equal(
    imapServer.daemon.getMailbox("Drafts"),
    null,
    "a failed CREATE should leave the IMAP Drafts folder absent"
  );
  Assert.equal(
    prompt.state.count,
    0,
    "identity folder creation should use its built-in local fallback"
  );
  Assert.ok(
    localRoot.containsChildNamed("Drafts"),
    "the local Drafts folder should be created"
  );
  const localDrafts = localRoot.getChildNamed("Drafts");
  Assert.equal(
    localDrafts.getTotalMessages(false),
    messageCount + 1,
    "the draft should be saved to Local Folders"
  );
  Assert.equal(
    smtpIdentity.draftsFolderURI,
    localDrafts.URI,
    "the identity should use the new local Drafts folder"
  );

  await BrowserTestUtils.closeWindow(composeWindow);
});

add_task(async function testRetryImapDraftCopyAfterFolderCreation() {
  Assert.equal(
    imapServer.daemon.getMailbox("Drafts"),
    null,
    "the IMAP Drafts folder should not exist yet"
  );
  smtpIdentity.draftsFolderURI =
    smtpAccount.incomingServer.serverURI + "/Drafts";

  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const progressStopped = progressStopPromise(composeWindow);
  imapServer.daemon.commandToFail = "APPEND";
  const prompt = mockRecoveryPrompt(composeWindow, 0, () => {
    Assert.ok(
      imapServer.daemon.getMailbox("Drafts"),
      "the IMAP Drafts folder should be created before APPEND fails"
    );
    imapServer.daemon.commandToFail = "";
  });

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-save"),
      {},
      composeWindow
    );
    await Promise.all([prompt.promptCalled, progressStopped]);
  } finally {
    prompt.restore();
    imapServer.daemon.commandToFail = "";
  }

  Assert.ok(
    prompt.state.hadOpenComposeParent,
    "the draft retry prompt should have an open compose parent"
  );
  Assert.equal(prompt.state.count, 1, "one draft retry prompt should be shown");
  Assert.equal(
    imapServer.daemon.getMailbox("Drafts")._messages.length,
    1,
    "retry should save one message to the new IMAP Drafts folder"
  );

  await BrowserTestUtils.closeWindow(composeWindow);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AlertTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/AlertTestUtils.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { MsgUtils } = ChromeUtils.importESModule(
  "resource:///modules/MimeMessageUtils.sys.mjs"
);

let alerts = 0;

function alertPS(_parent, _title, text) {
  alerts++;
  Assert.stringContains(
    text,
    "The folder selected for sent messages could not be found.",
    "the alert should explain the missing configured folder"
  );
}

add_task(async function test_fccUsesDeliveryMode() {
  const identity = {
    doFcc: true,
    fccFolderURI: "mailbox://missing/Sent",
    async getOrCreateFccFolderAsync() {
      throw Components.Exception(
        "Missing Sent folder",
        Cr.NS_MSG_ERROR_FOLDER_MISSING
      );
    },
  };
  const compTypes = [
    Ci.nsIMsgCompType.New,
    Ci.nsIMsgCompType.Draft,
    Ci.nsIMsgCompType.Template,
  ];
  const saveModes = [
    Ci.nsIMsgSend.nsMsgSaveAsDraft,
    Ci.nsIMsgSend.nsMsgSaveAsTemplate,
  ];
  for (const compType of compTypes) {
    for (const deliverMode of saveModes) {
      const uri = await MsgUtils.getFcc(
        identity,
        {},
        null,
        compType,
        deliverMode
      );
      Assert.equal(
        uri,
        identity.fccFolderURI,
        `Saving with compose type ${compType} and mode ${deliverMode} should retain the future Sent URI`
      );
    }
    await Assert.rejects(
      MsgUtils.getFcc(
        identity,
        {},
        null,
        compType,
        Ci.nsIMsgSend.nsMsgDeliverNow
      ),
      e => e.result == Cr.NS_MSG_ERROR_FOLDER_MISSING,
      `Sending with compose type ${compType} should require its Sent folder`
    );
  }
});

add_task(async function test_sendLaterMissingSentFolder() {
  AlertTestUtils.register({ alertPS });
  registerCleanupFunction(() => AlertTestUtils.cleanup());
  localAccountUtils.loadLocalMailAccount();
  const smtp = setupServerDaemon();
  smtp.start();
  const outgoingServer = getBasicSmtpServer(smtp.port);
  const account = MailServices.accounts.createAccount();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );
  account.incomingServer = incomingServer;
  const identity = getSmtpIdentity("from@foo.invalid", outgoingServer);
  account.addIdentity(identity);
  MailServices.accounts.defaultAccount = account;
  identity.fccFolderPickerMode = "1";
  identity.fccFolderURI = `${localAccountUtils.rootFolder.URI}/MissingSent`;

  const sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );
  registerCleanupFunction(() => {
    outgoingServer.closeCachedConnections();
    incomingServer.closeCachedConnections();
    smtp.stop();
    MailServices.accounts.removeAccount(account, false);
  });
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.from = identity.email;
  fields.to = "recipient@foo.invalid";
  const statuses = [];
  const send = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  await Assert.rejects(
    send.sendMessageFile(
      identity,
      account.key,
      fields,
      do_get_file("data/429891_testcase.eml"),
      false,
      false,
      Ci.nsIMsgSend.nsMsgSendUnsent,
      null,
      {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgSendListener"]),
        onStopSending(_id, status) {
          statuses.push(status);
        },
      },
      null
    ),
    error => error.result == Cr.NS_MSG_ERROR_FOLDER_MISSING,
    "file sending should reject when its configured Sent folder is missing"
  );
  Assert.deepEqual(
    statuses,
    [Cr.NS_MSG_ERROR_FOLDER_MISSING],
    "file sending should notify its listener once before rejecting"
  );
  Assert.equal(
    alerts,
    1,
    "file sending should display the configuration error"
  );
  alerts = 0;

  const outbox = sendLater.getUnsentMessagesFolder(identity);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    do_get_file("data/429891_testcase.eml"),
    outbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;
  const originalSMTPMessage = smtp._daemon.post;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const completed = Promise.withResolvers();
    let errors = 0;
    let completions = 0;
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgSendLaterListener"]),
      onStartSending() {},
      onMessageStartSending() {},
      onMessageSendProgress() {},
      onMessageSendError(_current, _header, status) {
        errors++;
        Assert.equal(
          status,
          Cr.NS_MSG_ERROR_FOLDER_MISSING,
          "the queued message should report its missing Sent folder"
        );
      },
      onStopSending(status, _message, tried, successful) {
        completions++;
        completed.resolve({ status, tried, successful });
      },
    };
    sendLater.addListener(listener);
    try {
      sendLater.sendUnsentMessages(identity);
      const result = await completed.promise;
      Assert.deepEqual(
        result,
        {
          status: Cr.NS_MSG_ERROR_FOLDER_MISSING,
          tried: 1,
          successful: 0,
        },
        "queued sending should complete with the folder-resolution error"
      );
      Assert.equal(errors, 1, "the message should report one failure");
      Assert.equal(completions, 1, "the queue should report completion once");
      Assert.ok(
        !sendLater.sendingMessages,
        "queued sending should release its sending state"
      );
      Assert.equal(
        outbox.getTotalMessages(false),
        1,
        "the unsent message should remain in the outbox"
      );
      Assert.equal(
        smtp._daemon.post,
        originalSMTPMessage,
        "SMTP should not receive the message"
      );
      Assert.equal(
        alerts,
        attempt,
        "each attempt should display one actionable error"
      );
    } finally {
      sendLater.removeListener(listener);
    }
  }
});

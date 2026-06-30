/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageSend } = ChromeUtils.importESModule(
  "resource:///modules/MessageSend.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const sender = "sender@example.invalid";
const recipient = "recipient@example.invalid";

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
});

function setupMessageSend(fakeSend) {
  const smtpServer = getBasicSmtpServer();
  const outgoingServer = smtpServer.wrappedJSObject;
  const originalSend = outgoingServer.sendMailMessage;
  outgoingServer.sendMailMessage = fakeSend.bind(outgoingServer);

  const identity = getSmtpIdentity(sender, smtpServer);
  const compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  compFields.from = sender;
  compFields.to = recipient;
  compFields.messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  const messageFile = do_get_file("data/message1.eml");
  const msgSend = new MessageSend();
  msgSend._userIdentity = identity;
  msgSend._compFields = compFields;
  msgSend._deliveryFile = messageFile;
  msgSend._messageFile = messageFile;
  msgSend._shouldRemoveMessageFile = false;
  msgSend._sendProgress = progress;
  msgSend._sendReport = Cc[
    "@mozilla.org/messengercompose/sendreport;1"
  ].createInstance(Ci.nsIMsgSendReport);
  msgSend._sendReport.deliveryMode = Ci.nsIMsgSend.nsMsgDeliverNow;
  msgSend._composeBundle = Services.strings.createBundle(
    "chrome://messenger/locale/messengercompose/composeMsgs.properties"
  );
  msgSend._deliverMode = Ci.nsIMsgSend.nsMsgDeliverNow;
  msgSend._compType = Ci.nsIMsgCompType.New;
  progress.registerListener(msgSend);

  return {
    msgSend,
    progress,
    restore() {
      try {
        progress.unregisterListener(msgSend);
      } catch (ex) {}
      outgoingServer.sendMailMessage = originalSend;
      MailServices.outgoingServer.deleteServer(smtpServer);
    },
  };
}

function waitForTimeout(timeout = 100) {
  return new Promise(resolve => do_timeout(timeout, resolve));
}

async function observeCancel({ queued = false } = {}) {
  let cancelStatus;
  let releaseSend;
  let listener;
  let sendStarted = false;
  let serverURI;
  const statuses = [];

  const { msgSend, progress, restore } = setupMessageSend(async function (
    ...args
  ) {
    serverURI = this.serverURI;
    listener = args.at(-1);
    if (queued) {
      await new Promise(resolve => {
        releaseSend = resolve;
      });
    }
    listener.onSendStart({
      cancel(status) {
        cancelStatus = status;
        listener.onSendStop(serverURI, status, null, null);
      },
    });
    sendStarted = true;
  });
  msgSend._sendListener = {
    onStartSending() {},
    onStopSending(msgId, status) {
      statuses.push(status);
    },
  };
  msgSend.sendDeliveryCallback = async (uri, status) => {
    msgSend.notifyListenerOnStopSending(null, status, null, null);
  };

  try {
    const deliveryPromise = msgSend._deliverAsMail().catch(error => error);
    if (queued) {
      await TestUtils.waitForCondition(
        () => releaseSend,
        "waiting for queued send"
      );
    } else {
      await TestUtils.waitForCondition(() => sendStarted, "waiting for send");
    }

    progress.processCanceledByUser = true;
    if (queued) {
      releaseSend();
      await TestUtils.waitForCondition(() => sendStarted, "waiting for start");
    }

    await waitForTimeout();
    if (cancelStatus === undefined) {
      await listener.onSendStop(serverURI, Cr.NS_OK, null, null);
    }
    await deliveryPromise;
  } finally {
    restore();
  }

  return {
    cancelStatus,
    reportedSuccess: statuses.includes(Cr.NS_OK),
  };
}

async function observeRequestCancel() {
  const server = setupServerDaemon();
  server.start();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity(sender, smtpServer);
  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  let resolveStop;
  const stopPromise = new Promise(resolve => {
    resolveStop = resolve;
  });
  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgOutgoingListener"]),
    onSendStart(request) {
      request.cancel(Cr.NS_ERROR_ABORT);
    },
    onSendStop(serverURI, exitCode) {
      resolveStop(exitCode);
    },
  };

  try {
    smtpServer.sendMailMessage(
      do_get_file("data/message1.eml"),
      MailServices.headerParser.parseEncodedHeaderW(recipient),
      [],
      identity,
      sender,
      null,
      null,
      false,
      messageId,
      listener
    );

    const outcome = await Promise.race([
      stopPromise,
      waitForTimeout(1000).then(() => "timeout"),
    ]);
    return outcome;
  } finally {
    server.stop();
    MailServices.outgoingServer.deleteServer(smtpServer);
  }
}

add_task(async function test_smtp_cancel() {
  Assert.deepEqual(
    {
      active: await observeCancel(),
      queued: await observeCancel({ queued: true }),
      request: await observeRequestCancel(),
    },
    {
      active: {
        cancelStatus: Cr.NS_ERROR_ABORT,
        reportedSuccess: false,
      },
      queued: {
        cancelStatus: Cr.NS_ERROR_ABORT,
        reportedSuccess: false,
      },
      request: Cr.NS_ERROR_ABORT,
    },
    "SMTP cancel"
  );
});

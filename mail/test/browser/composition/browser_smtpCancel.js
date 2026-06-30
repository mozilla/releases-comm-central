/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const sender = "sender@example.invalid";
const recipient = "recipient@example.invalid";

add_setup(function () {
  const identity = MailServices.accounts.defaultAccount.defaultIdentity;
  const originalEmail = identity.email;
  const originalFullName = identity.fullName;
  identity.email = sender;
  identity.fullName = "Sender";

  Services.prefs.setBoolPref("mailnews.show_send_progress", true);
  registerCleanupFunction(() => {
    identity.email = originalEmail;
    identity.fullName = originalFullName;
    Services.prefs.clearUserPref("mailnews.show_send_progress");
  });
});

add_task(async function test_progress_cancel() {
  const smtpServer = MailServices.outgoingServer.getServerByKey("smtp1");
  const outgoingServer = smtpServer.wrappedJSObject;
  const originalSend = outgoingServer.sendMailMessage;

  let cancelStatus;
  let missingCancel = false;
  let listener;
  const promptObserver = {
    observe(subject, topic) {
      if (topic != "domwindowopened") {
        return;
      }
      const win = subject;
      win.addEventListener(
        "load",
        () => {
          if (
            win.document.documentURI !=
            "chrome://global/content/commonDialog.xhtml"
          ) {
            return;
          }
          win.document.querySelector("dialog").getButton("accept").doCommand();
        },
        { once: true }
      );
    },
  };

  outgoingServer.sendMailMessage = function (...args) {
    listener = args.at(-1);
    listener.onSendStart({
      cancel(status) {
        cancelStatus = status;
        listener.onSendStop(outgoingServer.serverURI, status, null, null);
      },
    });
  };

  let cwc;
  try {
    cwc = await open_compose_new_mail();
    await setup_msg_contents(cwc, recipient, "SMTP cancel test", "body");
    Services.ww.registerNotification(promptObserver);
    const progressPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
      null,
      win =>
        win.document.documentURI ==
        "chrome://messenger/content/messengercompose/sendProgress.xhtml"
    );

    cwc.goDoCommand("cmd_sendNow");
    const progressWindow = await progressPromise;
    const closedPromise = BrowserTestUtils.domWindowClosed(progressWindow);

    progressWindow.document.querySelector("dialog").getButton("cancel").click();
    await closedPromise;

    if (cancelStatus === undefined) {
      missingCancel = true;
      await listener.onSendStop(
        outgoingServer.serverURI,
        Cr.NS_ERROR_ABORT,
        null,
        null
      );
    }

    await TestUtils.waitForTick();
    Services.ww.unregisterNotification(promptObserver);

    Assert.deepEqual(
      { cancelStatus, missingCancel },
      { cancelStatus: Cr.NS_ERROR_ABORT, missingCancel: false },
      "SMTP cancel"
    );
  } finally {
    try {
      Services.ww.unregisterNotification(promptObserver);
    } catch (ex) {}
    outgoingServer.sendMailMessage = originalSend;
    if (cwc && !cwc.closed) {
      await close_compose_window(cwc);
    }
  }
});

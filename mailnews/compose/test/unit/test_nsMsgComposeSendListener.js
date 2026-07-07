/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests nsMsgComposeSendListener, as a regression test for bug 2050589:
 * onStopCopy() must close the progress dialog even if GC dropped the JS
 * references to the compose object. Intentionally incomplete.
 *
 * TODO: Add more nsMsgComposeSendListener test coverage here.
 */

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
});

add_task(async function testOnStopCopyClosesProgressAfterGC() {
  const fakeSend = {
    listener: null,

    observe(subject) {
      // "mail-set-sender" fires right before sendMsg() creates the real
      // MessageSend, so the fake takes its place here.
      const compose = subject.QueryInterface(Ci.nsIMsgCompose);
      compose.messageSend = this.QueryInterface(Ci.nsIMsgSend);
    },

    createAndSendMessage(
      _editor,
      _identity,
      _accountKey,
      _fields,
      _isDigest,
      _dontDeliver,
      _deliverMode,
      _msgToReplace,
      _bodyType,
      _body,
      _parentWindow,
      _progress,
      listener
    ) {
      this.listener = listener;
      return Promise.resolve();
    },

    QueryInterface: ChromeUtils.generateQI(["nsIObserver", "nsIMsgSend"]),
  };

  Services.obs.addObserver(fakeSend, "mail-set-sender");
  registerCleanupFunction(() => {
    Services.obs.removeObserver(fakeSend, "mail-set-sender");
  });

  const identity = getSmtpIdentity(
    "sender@example.invalid",
    getBasicSmtpServer()
  );
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.to = "recipient@example.invalid";
  fields.subject = "Test OnStopCopy after compose GC";
  fields.body = "Body";

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;

  let msgCompose = MailServices.compose.initCompose(params);
  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );

  const progressStopped = Promise.withResolvers();
  const progressListener = {
    onStateChange(_webProgress, _request, stateFlags, status) {
      if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        progressStopped.resolve(status);
      }
    },
    onProgressChange() {},
    onLocationChange() {},
    onStatusChange() {},
    onSecurityChange() {},
    onContentBlockingEvent() {},

    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),
  };
  progress.registerListener(progressListener);

  const sendPromise = msgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgDeliverNow,
    identity,
    "",
    progress
  );
  Assert.ok(fakeSend.listener, "sendMsg should create a send listener");
  await sendPromise;
  await new Promise(resolve => do_timeout(0, resolve));

  const copyListener = fakeSend.listener.QueryInterface(
    Ci.nsIMsgCopyServiceListener
  );

  // MessageSend defers onStopCopy() until after the send promise resolves.
  // Force the garbage collection that may drop the weak compose reference in
  // that gap.
  msgCompose = null;
  Cu.forceGC();
  Cu.forceCC();
  Cu.forceGC();

  copyListener.onStopCopy(Cr.NS_OK);

  const stopStatus = await Promise.race([
    progressStopped.promise,
    new Promise((_, reject) =>
      do_timeout(1000, () =>
        reject(new Error("Timed out waiting for progress to stop"))
      )
    ),
  ]);

  Assert.equal(
    stopStatus,
    Cr.NS_OK,
    "onStopCopy should close the progress dialog after compose GC"
  );
});

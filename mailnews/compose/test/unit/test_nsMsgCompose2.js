/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMsgCompose functions relating to send listeners.
 */

let gMsgCompose = null;
const numSendListenerFunctions = 7;

const gSLAll = new Array(numSendListenerFunctions + 1);

function sendListener() {}

sendListener.prototype = {
  mReceived: 0,
  mAutoRemoveItem: 0,

  onStartSending() {
    this.mReceived |= 0x01;
    if (this.mAutoRemoveItem == 0x01) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onProgress() {
    this.mReceived |= 0x02;
    if (this.mAutoRemoveItem == 0x02) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onStatus() {
    this.mReceived |= 0x04;
    if (this.mAutoRemoveItem == 0x04) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onStopSending() {
    this.mReceived |= 0x08;
    if (this.mAutoRemoveItem == 0x08) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onGetDraftFolderURI() {
    this.mReceived |= 0x10;
    if (this.mAutoRemoveItem == 0x10) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onSendNotPerformed() {
    this.mReceived |= 0x20;
    if (this.mAutoRemoveItem == 0x20) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
  onTransportSecurityError() {
    this.mReceived |= 0x40;
    if (this.mAutoRemoveItem == 0x40) {
      gMsgCompose.removeMsgSendListener(this);
    }
  },
};

function NotifySendListeners() {
  gMsgCompose.onStartSending(null, null);
  gMsgCompose.onProgress(null, null, null);
  gMsgCompose.onStatus(null, null);
  gMsgCompose.onStopSending(null, null, null, null);
  gMsgCompose.onGetDraftFolderURI(null, null);
  gMsgCompose.onSendNotPerformed(null, null);
  gMsgCompose.onTransportSecurityError(null, null, null, "");
}

function run_test() {
  gMsgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  gMsgCompose.initialize(params);

  Assert.ok(gMsgCompose != null);

  // Test - Add a listener

  for (let i = 0; i < numSendListenerFunctions + 1; ++i) {
    gSLAll[i] = new sendListener();
    gMsgCompose.addMsgSendListener(gSLAll[i]);
  }

  // Test - Notify all listeners

  NotifySendListeners();

  const bitMask = (1 << numSendListenerFunctions) - 1;
  for (let i = 0; i < numSendListenerFunctions + 1; ++i) {
    Assert.equal(gSLAll[i].mReceived, bitMask);
    gSLAll[i].mReceived = 0;

    // And prepare for test 3.
    gSLAll[i].mAutoRemoveItem = 1 << i;
  }

  // Test - Remove some listeners as we go

  NotifySendListeners();

  let currentReceived = 0;

  for (let i = 0; i < numSendListenerFunctions + 1; ++i) {
    if (i < numSendListenerFunctions) {
      currentReceived += 1 << i;
    }

    Assert.equal(gSLAll[i].mReceived, currentReceived);
    gSLAll[i].mReceived = 0;
  }

  // Test - Ensure the listeners have been removed.

  NotifySendListeners();

  for (let i = 0; i < numSendListenerFunctions + 1; ++i) {
    if (i < numSendListenerFunctions) {
      Assert.equal(gSLAll[i].mReceived, 0);
    } else {
      Assert.equal(gSLAll[i].mReceived, bitMask);
    }
  }

  // Test - Remove main listener

  gMsgCompose.removeMsgSendListener(gSLAll[numSendListenerFunctions]);
}

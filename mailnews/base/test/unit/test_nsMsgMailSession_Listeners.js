/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMsgMailSession functions relating to listeners.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var numListenerFunctions = 8;

// The MailSession also implements nsIFolderListener - used to relay
// notifications onward to all the registered listeners.
var gMailSessionNotifier = MailServices.mailSession.QueryInterface(
  Ci.nsIFolderListener
);

var gFLAll;
var gFLSingle = new Array(numListenerFunctions);

function fL() {}

fL.prototype = {
  mReceived: 0,
  mAutoRemoveItem: false,

  onFolderAdded() {
    this.mReceived |= Ci.nsIFolderListener.added;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onMessageAdded() {
    this.mReceived |= Ci.nsIFolderListener.added;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderRemoved() {
    this.mReceived |= Ci.nsIFolderListener.removed;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onMessageRemoved() {
    this.mReceived |= Ci.nsIFolderListener.removed;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderPropertyChanged() {
    this.mReceived |= Ci.nsIFolderListener.propertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderIntPropertyChanged() {
    this.mReceived |= Ci.nsIFolderListener.intPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderBoolPropertyChanged() {
    this.mReceived |= Ci.nsIFolderListener.boolPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderUnicharPropertyChanged() {
    this.mReceived |= Ci.nsIFolderListener.unicharPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderPropertyFlagChanged() {
    this.mReceived |= Ci.nsIFolderListener.propertyFlagChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  onFolderEvent() {
    this.mReceived |= Ci.nsIFolderListener.event;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
};

function NotifyMailSession() {
  gMailSessionNotifier.onFolderAdded(null, null);
  gMailSessionNotifier.onMessageAdded(null, null);
  gMailSessionNotifier.onFolderRemoved(null, null);
  gMailSessionNotifier.onMessageRemoved(null, null);
  gMailSessionNotifier.onFolderPropertyChanged(null, null, null, null);
  gMailSessionNotifier.onFolderIntPropertyChanged(null, null, null, null);
  gMailSessionNotifier.onFolderBoolPropertyChanged(null, null, null, null);
  gMailSessionNotifier.onFolderUnicharPropertyChanged(null, null, null, null);
  gMailSessionNotifier.onFolderPropertyFlagChanged(null, null, null, null);
  gMailSessionNotifier.onFolderEvent(null, null);
}

function run_test() {
  var i;

  Assert.ok(MailServices.mailSession != null);

  // Test - Add a listener

  gFLAll = new fL();

  MailServices.mailSession.AddFolderListener(gFLAll, Ci.nsIFolderListener.all);

  for (i = 0; i < numListenerFunctions; ++i) {
    gFLSingle[i] = new fL();
    MailServices.mailSession.AddFolderListener(gFLSingle[i], Math.pow(2, i));
  }

  // Test - Notify listener on all available items

  NotifyMailSession();

  Assert.equal(gFLAll.mReceived, Math.pow(2, numListenerFunctions) - 1);
  gFLAll.mReceived = 0;

  for (i = 0; i < numListenerFunctions; ++i) {
    Assert.equal(gFLSingle[i].mReceived, Math.pow(2, i));
    gFLSingle[i].mReceived = 0;

    // And prepare for test 3.
    gFLSingle[i].mAutoRemoveItem = true;
  }

  // Test - Remove Single Listeners as we go through the functions

  // Check the for loop above for changes to the single listeners.

  NotifyMailSession();

  Assert.equal(gFLAll.mReceived, Math.pow(2, numListenerFunctions) - 1);
  gFLAll.mReceived = 0;

  for (i = 0; i < numListenerFunctions; ++i) {
    Assert.equal(gFLSingle[i].mReceived, Math.pow(2, i));
    gFLSingle[i].mReceived = 0;
  }

  // Test - Ensure the single listeners have been removed.

  NotifyMailSession();

  Assert.equal(gFLAll.mReceived, Math.pow(2, numListenerFunctions) - 1);
  gFLAll.mReceived = 0;

  for (i = 0; i < numListenerFunctions; ++i) {
    Assert.equal(gFLSingle[i].mReceived, 0);
  }

  // Test - Remove main listener

  MailServices.mailSession.RemoveFolderListener(gFLAll);
}

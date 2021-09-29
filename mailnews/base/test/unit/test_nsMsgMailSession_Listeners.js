/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMsgMailSession functions relating to listeners.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
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

  OnItemAdded(parentItem, item) {
    this.mReceived |= Ci.nsIFolderListener.added;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemRemoved(parentItem, item) {
    this.mReceived |= Ci.nsIFolderListener.removed;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemPropertyChanged(item, property, oldValue, newValue) {
    this.mReceived |= Ci.nsIFolderListener.propertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemIntPropertyChanged(item, property, oldValue, newValue) {
    this.mReceived |= Ci.nsIFolderListener.intPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemBoolPropertyChanged(item, property, oldValue, newValue) {
    this.mReceived |= Ci.nsIFolderListener.boolPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemUnicharPropertyChanged(item, property, oldValue, newValue) {
    this.mReceived |= Ci.nsIFolderListener.unicharPropertyChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemPropertyFlagChanged(item, property, oldValue, newValue) {
    this.mReceived |= Ci.nsIFolderListener.propertyFlagChanged;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
  OnItemEvent(parentItem, item) {
    this.mReceived |= Ci.nsIFolderListener.event;
    if (this.mAutoRemoveItem) {
      MailServices.mailSession.RemoveFolderListener(this);
    }
  },
};

function NotifyMailSession() {
  gMailSessionNotifier.OnItemAdded(null, null);
  gMailSessionNotifier.OnItemRemoved(null, null);
  gMailSessionNotifier.OnItemPropertyChanged(null, null, null, null);
  gMailSessionNotifier.OnItemIntPropertyChanged(null, null, null, null);
  gMailSessionNotifier.OnItemBoolPropertyChanged(null, null, null, null);
  gMailSessionNotifier.OnItemUnicharPropertyChanged(null, null, null, null);
  gMailSessionNotifier.OnItemPropertyFlagChanged(null, null, null, null);
  gMailSessionNotifier.OnItemEvent(null, null);
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

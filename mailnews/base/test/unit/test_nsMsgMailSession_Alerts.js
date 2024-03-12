/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMsgMailSession functions relating to alerts and their
 * listeners.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var gDialogTitle = null;
var gText = null;

function reset() {
  gDialogTitle = null;
  gText = null;
}

/* exported alert */
// Used in alertTestUtils.
function alert(aDialogTitle, aText) {
  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  gDialogTitle = aDialogTitle;
  gText = aText;
}

var msgWindow = {
  get promptDialog() {
    return alertUtilsPrompts;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgWindow"]),
};

var msgUrl = {
  _msgWindow: null,

  get msgWindow() {
    return this._msgWindow;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgMailNewsUrl"]),
};

function alertListener() {}

alertListener.prototype = {
  mReturn: false,
  mMessage: null,
  mMsgWindow: null,

  reset() {
    this.mMessage = null;
    this.mMsgWindow = null;
  },

  onAlert(aMessage, aMsgWindow) {
    Assert.equal(this.mMessage, null);
    Assert.equal(this.mMsgWindow, null);

    this.mMessage = aMessage;
    this.mMsgWindow = aMsgWindow;

    return this.mReturn;
  },
  QueryInferface: ChromeUtils.generateQI([Ci.nsIMsgMailNewsUrl]),
};

function run_test() {
  // Test - No listeners, check alert tries to alert the user.

  reset();

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("test message", msgUrl);

  // The dialog title doesn't get set at the moment.
  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "test message");

  // Test - No listeners and no msgWindow, check no alerts.

  reset();

  msgUrl._msgWindow = null;

  MailServices.mailSession.alertUser("test no message", msgUrl);

  // The dialog title doesn't get set at the moment.
  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  // Test - One listener, returning false (prompt should still happen).

  reset();

  var listener1 = new alertListener();
  listener1.mReturn = false;

  MailServices.mailSession.addUserFeedbackListener(listener1);

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("message test", msgUrl);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "message test");

  Assert.equal(listener1.mMessage, "message test");
  Assert.notEqual(listener1.mMsgWindow, null);

  // Test - One listener, returning false, no msg window (prompt shouldn't
  //        happen).

  reset();
  listener1.reset();

  MailServices.mailSession.alertUser("message test no prompt", null);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  Assert.equal(listener1.mMessage, "message test no prompt");
  Assert.equal(listener1.mMsgWindow, null);

  // Test - Two listeners, both returning false (prompt should happen).

  reset();
  listener1.reset();

  var listener2 = new alertListener();
  listener2.mReturn = false;

  MailServices.mailSession.addUserFeedbackListener(listener2);

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("two listeners", msgUrl);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "two listeners");

  Assert.equal(listener1.mMessage, "two listeners");
  Assert.notEqual(listener1.mMsgWindow, null);

  Assert.equal(listener2.mMessage, "two listeners");
  Assert.notEqual(listener2.mMsgWindow, null);

  // Test - Two listeners, one returning true (prompt shouldn't happen).

  reset();
  listener1.reset();
  listener2.reset();

  listener2.mReturn = true;

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("no prompt", msgUrl);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  Assert.equal(listener1.mMessage, "no prompt");
  Assert.notEqual(listener1.mMsgWindow, null);

  Assert.equal(listener2.mMessage, "no prompt");
  Assert.notEqual(listener2.mMsgWindow, null);

  // Test - Remove a listener.

  reset();
  listener1.reset();
  listener2.reset();

  MailServices.mailSession.removeUserFeedbackListener(listener1);

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("remove listener", msgUrl);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  Assert.equal(listener1.mMessage, null);
  Assert.equal(listener1.mMsgWindow, null);

  Assert.equal(listener2.mMessage, "remove listener");
  Assert.notEqual(listener2.mMsgWindow, null);

  // Test - Remove the other listener.

  reset();
  listener1.reset();
  listener2.reset();

  MailServices.mailSession.removeUserFeedbackListener(listener2);

  msgUrl._msgWindow = msgWindow;

  MailServices.mailSession.alertUser("no listeners", msgUrl);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "no listeners");

  Assert.equal(listener1.mMessage, null);
  Assert.equal(listener1.mMsgWindow, null);

  Assert.equal(listener2.mMessage, null);
  Assert.equal(listener2.mMsgWindow, null);
}

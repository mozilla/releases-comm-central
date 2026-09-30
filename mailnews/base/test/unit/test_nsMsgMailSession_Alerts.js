/*
 * Test suite for nsMsgMailSession functions relating to alerts and their
 * listeners.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");
registerAlertTestUtils();

var gDialogTitle = null;
var gText = null;

function reset() {
  gDialogTitle = null;
  gText = null;
}

/* exported alert */
// Used in alertTestUtils.
function alertPS(aParent, aDialogTitle, aText) {
  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  gDialogTitle = aDialogTitle;
  gText = aText;
}

var msgUrl = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgMailNewsUrl"]),
};

function alertListener() {}

alertListener.prototype = {
  mReturn: false,
  mMessage: null,

  reset() {
    this.mMessage = null;
  },

  onAlert(message, _serverKey, _silent) {
    Assert.equal(this.mMessage, null);

    this.mMessage = message;

    return this.mReturn;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
};

function run_test() {
  // Test - No listeners, check alert tries to alert the user.

  reset();

  MailServices.mailSession.alertUser("test message", msgUrl, false);

  // The dialog title doesn't get set at the moment.
  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "test message");

  // Test - One listener, returning false (prompt should still happen).

  reset();

  var listener1 = new alertListener();
  listener1.mReturn = false;

  MailServices.mailSession.addUserFeedbackListener(listener1);

  MailServices.mailSession.alertUser("message test", msgUrl, false);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "message test");

  Assert.equal(listener1.mMessage, "message test");

  // Test - Two listeners, both returning false (prompt should happen).

  reset();
  listener1.reset();

  var listener2 = new alertListener();
  listener2.mReturn = false;

  MailServices.mailSession.addUserFeedbackListener(listener2);

  MailServices.mailSession.alertUser("two listeners", msgUrl, false);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "two listeners");

  Assert.equal(listener1.mMessage, "two listeners");

  Assert.equal(listener2.mMessage, "two listeners");

  // Test - Two listeners, one returning true (prompt shouldn't happen).

  reset();
  listener1.reset();
  listener2.reset();

  listener2.mReturn = true;

  MailServices.mailSession.alertUser("no prompt", msgUrl, false);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  Assert.equal(listener1.mMessage, "no prompt");

  Assert.equal(listener2.mMessage, "no prompt");

  // Test - Remove a listener.

  reset();
  listener1.reset();
  listener2.reset();

  MailServices.mailSession.removeUserFeedbackListener(listener1);

  MailServices.mailSession.alertUser("remove listener", msgUrl, false);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, null);

  Assert.equal(listener1.mMessage, null);

  Assert.equal(listener2.mMessage, "remove listener");

  // Test - Remove the other listener.

  reset();
  listener1.reset();
  listener2.reset();

  MailServices.mailSession.removeUserFeedbackListener(listener2);

  MailServices.mailSession.alertUser("no listeners", msgUrl, false);

  Assert.equal(gDialogTitle, null);
  Assert.equal(gText, "no listeners");

  Assert.equal(listener1.mMessage, null);

  Assert.equal(listener2.mMessage, null);
}

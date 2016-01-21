/*
 * Tests that the mail-set-sender observer, used by extensions to modify the
 * outgoing server, works.
 *
 * This is adapted from test_messageHeaders.js
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC("@mozilla.org/messengercompose/composefields;1",
                    Ci.nsIMsgCompFields);

// nsIObserver implementation.
var gData = "";
var observer = {
  observe: function (aSubject, aTopic, aData) {
    if (aTopic == "mail-set-sender") {
      Assert.ok(aSubject instanceof Ci.nsIMsgCompose);
      gData = aData;
    }
  }
}

add_task(function* testObserver() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.fullName = "Observer Tester";
  fields.to = "Emile <nobody@tinderbox.invalid>";
  fields.cc = "Alex <alex@tinderbox.invalid>";
  fields.subject = "Let's test the observer";

  yield richCreateMessage(fields, [], identity);
  // observer data should have:
  // (no account), Ci.nsIMsgSend.nsMsgSaveAsDraft, identity.key
  Assert.equal(gData, ",4,id1");

  // Now try with an account
  yield richCreateMessage(fields, [], identity, localAccountUtils.msgAccount);
  // observer data should have:
  // (local account key), Ci.nsIMsgSend.nsMsgSaveAsDraft, identity.key
  Assert.equal(gData, "account1,4,id1");
});

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  Services.obs.addObserver(observer, "mail-set-sender", false);
  run_next_test();
}

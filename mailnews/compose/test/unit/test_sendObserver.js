/*
 * Tests that the mail-set-sender observer, used by extensions to modify the
 * outgoing server, works.
 *
 * This is adapted from test_messageHeaders.js
 */

var CompFields = CC(
  "@mozilla.org/messengercompose/composefields;1",
  Ci.nsIMsgCompFields
);

// nsIObserver implementation.
var gData = "";
var observer = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "mail-set-sender") {
      Assert.ok(aSubject instanceof Ci.nsIMsgCompose);
      gData = aData;
    }
  },
};

add_task(async function testObserver() {
  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  identity.fullName = "Observer Tester";
  fields.to = "Emile <nobody@tinderbox.invalid>";
  fields.cc = "Alex <alex@tinderbox.invalid>";
  fields.subject = "Let's test the observer";

  await richCreateMessage(fields, [], identity);
  // observer data should have:
  // (no account), Ci.nsIMsgSend.nsMsgSaveAsDraft, identity.key
  Assert.equal(gData, ",4,id1");

  // Now try with an account
  await richCreateMessage(fields, [], identity, localAccountUtils.msgAccount);
  // observer data should have:
  // (local account key), Ci.nsIMsgSend.nsMsgSaveAsDraft, identity.key
  Assert.equal(gData, "account1,4,id1");
});

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  Services.obs.addObserver(observer, "mail-set-sender");
  run_next_test();
}

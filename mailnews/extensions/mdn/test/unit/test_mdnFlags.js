/**
 * This tests that setting mdn flags works correctly, so that we don't
 * reprompt when the user re-selects a message.
 */

localAccountUtils.loadLocalMailAccount();

var localAccount = MailServices.accounts.findAccountForServer(
  localAccountUtils.incomingServer
);
var identity = MailServices.accounts.createIdentity();
identity.email = "bob@t2.example.net";
localAccount.addIdentity(identity);
localAccount.defaultIdentity = identity;

function run_test() {
  var headers =
    "from: alice@t1.example.com\r\n" +
    "to: bob@t2.example.net\r\n" +
    "return-path: alice@t1.example.com\r\n" +
    "Disposition-Notification-To: alice@t1.example.com\r\n";

  const mimeHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
    Ci.nsIMimeHeaders
  );
  mimeHdr.initialize(headers);
  mimeHdr.extractHeader("To", false);

  localAccountUtils.inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localAccountUtils.inboxFolder.addMessage(headers + "\r\nhello\r\n");
  // Need to setup some prefs
  Services.prefs.setBoolPref("mail.mdn.report.enabled", true);
  Services.prefs.setIntPref("mail.mdn.report.not_in_to_cc", 2);
  Services.prefs.setIntPref("mail.mdn.report.other", 2);
  Services.prefs.setIntPref("mail.mdn.report.outside_domain", 2);

  var msgFolder = localAccountUtils.inboxFolder;

  var msgWindow = {};

  var msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);

  // Everything looks good so far, let's generate the MDN response.
  var mdnGenerator = Cc[
    "@mozilla.org/messenger-mdn/generator;1"
  ].createInstance(Ci.nsIMsgMdnGenerator);
  mdnGenerator.process(
    Ci.nsIMsgMdnGenerator.eDisplayed,
    msgWindow,
    msgFolder,
    msgHdr.messageKey,
    mimeHdr,
    false
  );
  mdnGenerator.userDeclined();
  Assert.notEqual(msgHdr.flags & Ci.nsMsgMessageFlags.MDNReportSent, 0);
  Assert.equal(msgHdr.flags & Ci.nsMsgMessageFlags.MDNReportNeeded, 0);
}

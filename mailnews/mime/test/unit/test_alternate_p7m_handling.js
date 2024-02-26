/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);

const P7M_ATTACHMENT = "dGhpcyBpcyBub3QgYSByZWFsIHMvbWltZSBwN20gZW50aXR5";
var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgHdr;

add_setup(async function () {
  // Create a message with a p7m attachment.
  const synMsg = messageGenerator.makeMessage({
    attachments: [
      {
        body: P7M_ATTACHMENT,
        filename: "test.txt.p7m",
        contentType: "application/pkcs7-mime",
        format: "",
        encoding: "base64",
      },
    ],
  });
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);
  msgHdr = synSet.getMsgHdr(0);
});

add_task(async function test_mime_p7m_external_foo_pref() {
  Services.prefs.setBoolPref("mailnews.p7m_external", true);

  await new Promise(resolve => {
    MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
      Assert.ok(aMimeMsg.allUserAttachments.length == 1);
      resolve();
    });
  });
});
add_task(async function test_mime_p7m_external_all_external_pref() {
  Services.prefs.setBoolPref("mailnews.p7m_external", false);

  await new Promise(resolve => {
    MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
      Assert.ok(aMimeMsg.allUserAttachments.length == 1);
      resolve();
    });
  });
});

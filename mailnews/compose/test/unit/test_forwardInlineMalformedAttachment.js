/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Forwarding inline a message whose source multipart lacks the closing
 * boundary must still produce the full decoded attachment. See bug 580842.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MimeParser } = ChromeUtils.importESModule(
  "resource:///modules/mimeParser.sys.mjs"
);

const ATTACHMENT_NAME = "test-attachment.bin";
const ATTACHMENT_BODY = "0123456789".repeat(467);

function getDecodedAttachmentBody(message) {
  let currentPart = null;
  let decoded = null;
  MimeParser.parseSync(
    message,
    {
      startPart(partNum, headers) {
        const cd = headers.has("content-disposition")
          ? headers.getRawHeader("content-disposition")[0]
          : "";
        if (cd.includes(ATTACHMENT_NAME)) {
          currentPart = partNum;
          decoded = "";
        }
      },
      deliverPartData(partNum, data) {
        if (partNum == currentPart) {
          decoded += data;
        }
      },
      endPart(partNum) {
        if (partNum == currentPart) {
          currentPart = null;
        }
      },
    },
    { bodyformat: "decode" }
  );
  return decoded;
}

add_task(async function testForwardInlineKeepsMalformedAttachmentData() {
  localAccountUtils.loadLocalMailAccount();
  const gServer = setupServerDaemon();
  gServer.start();
  registerCleanupFunction(() => gServer.stop());

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(gServer.port)
  );
  localAccountUtils.msgAccount.addIdentity(identity);
  localAccountUtils.msgAccount.defaultIdentity = identity;

  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    do_get_file("data/malformed-multipart-missing-close-boundary.eml"),
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  MailServices.compose.forwardMessage(
    "to@local.invalid",
    mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder),
    null,
    localAccountUtils.incomingServer,
    Ci.nsIMsgComposeService.kForwardInline
  );

  await TestUtils.waitForCondition(
    () => gServer._daemon.post,
    "waiting for forwarded message"
  );

  const decoded = getDecodedAttachmentBody(gServer._daemon.post);
  Assert.equal(
    decoded?.length,
    ATTACHMENT_BODY.length,
    "forwarded attachment length matches source"
  );
  Assert.equal(
    decoded,
    ATTACHMENT_BODY,
    "forwarded attachment content matches"
  );
});

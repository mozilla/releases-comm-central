/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var msgGen = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();

add_task(async function test_octet_stream_qp_attachment_is_decoded() {
  const synMsg = msgGen.makeMessage({
    attachments: [
      {
        body: "key=3Dvalue\r\n",
        contentType: "application/octet-stream",
        encoding: "quoted-printable",
        filename: "test.bin",
        format: "",
      },
    ],
  });
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const msgURI = synSet.getMsgURI(0);
  const msgService = MailServices.messageServiceFromURI(msgURI);
  // makeMessage produces multipart/mixed: part 1.1 = text body, part 1.2 = attachment.
  const partURL = Services.io.newURI(
    msgService.getUrlForUri(msgURI).spec + "&part=1.2"
  );

  const deferred = Promise.withResolvers();
  NetUtil.asyncFetch(
    { uri: partURL, loadUsingSystemPrincipal: true },
    (stream, status) => {
      if (!Components.isSuccessCode(status)) {
        deferred.reject(new Error("asyncFetch failed: " + status));
        return;
      }
      try {
        const data = NetUtil.readInputStreamToString(
          stream,
          stream.available()
        );
        deferred.resolve(data);
      } catch (e) {
        // If stream is already closed, it might be because it's empty or finished.
        if (e.result == Cr.NS_BASE_STREAM_CLOSED) {
          deferred.resolve("");
        } else {
          deferred.reject(e);
        }
      }
    }
  );
  Assert.equal(
    (await deferred.promise).trimEnd(),
    "key=value",
    "attachment bytes must be QP-decoded"
  );
});

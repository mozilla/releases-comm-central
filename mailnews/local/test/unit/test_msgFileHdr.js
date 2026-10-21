/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const FROM = "No Reply <noreply@example.com>";
const REPLY_TO = "Real Person <real@example.com>";

async function getFileHdr(name, content) {
  const path = PathUtils.join(PathUtils.profileDir, name);
  await IOUtils.writeUTF8(path, content);
  const uri = PathUtils.toFileURI(path);
  return MailServices.messageServiceFromURI(uri).messageURIToMsgHdr(uri);
}

add_task(async function test_replyTo() {
  const hdr = await getFileHdr(
    "replyTo.eml",
    [
      `From: ${FROM}`,
      `Reply-To: ${REPLY_TO}`,
      "To: someone@example.com",
      "Subject: Reply-To test",
      "Date: Mon, 19 Oct 2026 10:00:00 +0000",
      "Message-ID: <reply-to-test@example.com>",
      "",
      "Body",
      "",
    ].join("\r\n")
  );

  // Ask for the property first, so nothing else has made the header read the
  // file yet.
  Assert.equal(
    hdr.getStringProperty("replyTo"),
    REPLY_TO,
    "the header should have the Reply-To of the file"
  );
  Assert.equal(hdr.author, FROM, "the header should have the From of the file");
});

add_task(async function test_replyToLowerCase() {
  const hdr = await getFileHdr(
    "replyToLowerCase.eml",
    [
      `From: ${FROM}`,
      `reply-to: ${REPLY_TO}`,
      "To: someone@example.com",
      "Subject: Lowercase reply-to test",
      "",
      "Body",
      "",
    ].join("\r\n")
  );

  Assert.equal(
    hdr.getStringProperty("replyTo"),
    REPLY_TO,
    "a lowercase reply-to header should be found"
  );
});

add_task(async function test_noReplyTo() {
  const hdr = await getFileHdr(
    "noReplyTo.eml",
    [
      `From: ${FROM}`,
      "To: someone@example.com",
      "Subject: No Reply-To test",
      "",
      "Body",
      "",
    ].join("\r\n")
  );

  Assert.equal(
    hdr.getStringProperty("replyTo"),
    "",
    "a file without Reply-To should have an empty replyTo"
  );
});

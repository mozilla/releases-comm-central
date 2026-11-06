/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that OpenPGP attachment handling does not load key attachments from an
 * X-Mozilla-External-Attachment-URL chosen by the sender.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let requests = 0;
let emlFile;

add_setup(async function () {
  const server = new HttpServer();
  server.registerPathHandler("/key.asc", (request, response) => {
    requests++;
    response.setHeader("Content-Type", "application/pgp-keys", false);
    response.write("not a key");
  });
  server.start(-1);
  const keyUrl = `http://localhost:${server.identity.primaryPort}/key.asc`;

  const emlPath = PathUtils.join(PathUtils.tempDir, "externalKey.eml");
  await IOUtils.writeUTF8(
    emlPath,
    [
      "From: Alice <alice@openpgp.example>",
      "To: Bob <bob@openpgp.example>",
      "Subject: External key attachment",
      "Date: Mon, 12 Oct 2026 12:00:00 +0000",
      "Message-ID: <external-key@openpgp.example>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="BOUNDARY"',
      "",
      "--BOUNDARY",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "Hello",
      "",
      "--BOUNDARY",
      'Content-Type: application/pgp-keys; name="key.asc"',
      'Content-Disposition: attachment; filename="key.asc"',
      `X-Mozilla-External-Attachment-URL: ${keyUrl}`,
      "",
      "External attachment",
      "",
      "--BOUNDARY--",
      "",
    ].join("\r\n")
  );
  emlFile = new FileUtils.File(emlPath);

  registerCleanupFunction(async () => {
    await new Promise(resolve => server.stop(resolve));
    await IOUtils.remove(emlPath);
  });
});

async function waitForPossibleRequest() {
  await TestUtils.waitForCondition(
    () => requests > 0,
    "waiting for a possible request",
    100,
    30
  ).catch(() => {});
}

add_task(async function test_external_key_attachment_not_loaded_on_display() {
  requests = 0;
  const msgc = await open_message_from_file(emlFile);

  await waitForPossibleRequest();
  Assert.equal(
    requests,
    0,
    "external key attachment url should not be loaded on display"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

add_task(async function test_external_key_attachment_not_loaded_on_open() {
  requests = 0;
  const msgc = await open_message_from_file(emlFile);
  const aboutMessage = get_about_message(msgc);

  const attachment = aboutMessage.currentAttachments.find(
    a => a.name == "key.asc"
  );
  Assert.ok(attachment?.isExternalAttachment, "attachment should be external");
  aboutMessage.Enigmail.msg.handleAttachment("openAttachment", attachment);

  await waitForPossibleRequest();
  Assert.equal(
    requests,
    0,
    "disallowed external key attachment url should not be loaded on open"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

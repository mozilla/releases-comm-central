/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Size accounting must preserve encoded related-part data for compose replay.
 * Forwarding inline should retain every decoded attachment byte, including parts
 * without Content-ID or Content-Location. See bugs 2077839 and 548507.
 */

const { MimeParser } = ChromeUtils.importESModule(
  "resource:///modules/mimeParser.sys.mjs"
);

add_task(async function testForwardInlineKeepsRelatedAttachmentData() {
  localAccountUtils.loadLocalMailAccount();

  // Wait for the SMTP end-of-data marker, rather than the first received chunk.
  let resolveMessage;
  const messageReceived = new Promise(resolve => {
    resolveMessage = resolve;
  });
  const server = setupServerDaemon(
    daemon =>
      new (class extends SMTP_RFC2821_handler {
        onMultiline(line) {
          const messageComplete = this.expectingData && line == ".";
          const response = super.onMultiline(line);
          if (messageComplete) {
            resolveMessage(daemon.post);
          }
          return response;
        }
      })(daemon)
  );
  server.start();
  registerCleanupFunction(() => server.stop());

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(server.port)
  );
  identity.composeHtml = true;
  localAccountUtils.msgAccount.addIdentity(identity);
  localAccountUtils.msgAccount.defaultIdentity = identity;

  // Cover memory and temporary-file buffering (50 KiB threshold), including
  // final base64 tokens with one and two padding characters. All parts are
  // unreferenced, and two per size lack both Content-ID and Content-Location.
  const attachments = [257, 128 * 1024 + 1, 128 * 1024 + 2].flatMap(size => {
    const body = Array.from({ length: size }, (_, i) =>
      String.fromCharCode(i % 256)
    ).join("");
    return [
      {
        name: `related-${size}.mp4`,
        body,
        headers: [`Content-ID: <related-${size}.mp4@example.invalid>`],
      },
      { name: `no-cid-${size}.mp4`, body, headers: [] },
      {
        name: `attachment-${size}.mp4`,
        body,
        headers: [
          `Content-Disposition: attachment; filename="attachment-${size}.mp4"`,
        ],
      },
    ];
  });
  const source = [
    "From: sender@example.invalid",
    "To: from@tinderbox.invalid",
    "Subject: Related attachment contents",
    "Message-ID: <related-contents@example.invalid>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; type="multipart/alternative"; boundary="related"',
    "",
    "--related",
    'Content-Type: multipart/alternative; boundary="alternative"',
    "",
    "--alternative",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Unreferenced related attachments.",
    "--alternative",
    "Content-Type: text/html; charset=UTF-8",
    "",
    "<html><body>Unreferenced related attachments.</body></html>",
    "--alternative--",
    ...attachments.flatMap(({ name, body, headers }) => [
      "--related",
      `Content-Type: video/mp4; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      ...headers,
      "",
      ...btoa(body).match(/.{1,76}/g),
    ]),
    "--related--",
    "",
  ].join("\r\n");
  localAccountUtils.inboxFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(source);

  MailServices.compose.forwardMessage(
    "to@local.invalid",
    mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder),
    null,
    localAccountUtils.incomingServer,
    Ci.nsIMsgComposeService.kForwardInline
  );

  const decoded = new Map();
  const partNames = new Map();
  MimeParser.parseSync(
    await messageReceived,
    {
      startPart(partNum, headers) {
        const disposition = headers.getRawHeader("content-disposition")?.[0];
        if (disposition) {
          const name = MimeParser.getParameter(disposition, "filename");
          partNames.set(partNum, name);
          decoded.set(name, "");
        }
      },
      deliverPartData(partNum, data) {
        if (partNames.has(partNum)) {
          const name = partNames.get(partNum);
          decoded.set(name, decoded.get(name) + data);
        }
      },
    },
    { bodyformat: "decode", strformat: "binarystring" }
  );

  Assert.deepEqual(
    [...decoded.keys()],
    attachments.map(attachment => attachment.name),
    "The forwarded message should retain all related attachment names"
  );
  for (const { name, body } of attachments) {
    const actual = decoded.get(name);
    Assert.equal(
      actual?.length,
      body.length,
      `${name} should retain its exact decoded size`
    );
    Assert.equal(actual, body, `${name} should retain every decoded byte`);
  }
});

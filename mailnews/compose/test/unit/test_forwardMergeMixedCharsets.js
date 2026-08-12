/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { MimeParser } = ChromeUtils.importESModule(
  "resource:///modules/mimeParser.sys.mjs"
);

// U+1B1C7 (Nushu). UTF-8 F0 9B 87 87.
const UTF8_NUSHU_QP = "=F0=9B=87=87";
// U+65E5 日 in ISO-2022-JP: ESC $ B F | ESC ( B
const ISO2022JP_NICHI_QP = "=1B=24=42=46=7C=1B=28=42";
// U+30BD ソ in Shift_JIS: 83 5C (trail byte is ASCII backslash)
const SHIFTJIS_SO_QP = "=83=5C";

const MESSAGE = [
  "From: sender@example.invalid",
  "To: recipient@example.invalid",
  "Subject: forward merge mixed charsets",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="B"',
  "",
  "--B",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  UTF8_NUSHU_QP,
  "--B",
  "Content-Type: text/plain; charset=ISO-2022-JP",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  ISO2022JP_NICHI_QP,
  "--B",
  "Content-Type: text/plain; charset=Shift_JIS",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  SHIFTJIS_SO_QP,
  "--B--",
  "",
].join("\r\n");

function getForwardedTextBody(message) {
  let text = "";
  MimeParser.parseSync(
    message,
    {
      deliverPartData(_partNum, data) {
        text += data;
      },
    },
    { bodyformat: "decode", strformat: "unicode" }
  );
  return text;
}

add_task(async function testForwardMergeMixedCharsets() {
  localAccountUtils.loadLocalMailAccount();
  const server = setupServerDaemon();
  server.start();
  registerCleanupFunction(() => server.stop());

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(server.port)
  );
  identity.composeHtml = false;
  localAccountUtils.msgAccount.addIdentity(identity);
  localAccountUtils.msgAccount.defaultIdentity = identity;

  localAccountUtils.inboxFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(MESSAGE);

  MailServices.compose.forwardMessage(
    "to@local.invalid",
    mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder),
    null,
    localAccountUtils.incomingServer,
    Ci.nsIMsgComposeService.kForwardInline
  );

  await TestUtils.waitForCondition(
    () => server._daemon.post,
    "waiting for forwarded message"
  );

  // Purposefully hostile including but not limited to overlapping byte
  // sequences so this cannot decode correctly by chance under reasonable settings.
  const expectedBody = "\u{1B1C7}\r\n\r\n\u65E5\r\n\r\n\u30BD";
  const body = getForwardedTextBody(server._daemon.post);
  Assert.ok(
    body.includes(expectedBody),
    "forwarded body must decode each merged part with its own charset"
  );
});

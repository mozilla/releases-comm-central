/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that an untyped text part (missing subtype in Content-Type) correctly
 * preserves and applies its Content-Transfer-Encoding and charset.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

add_task(async function test_untyped_text_part_cte_and_charset() {
  const file = new FileUtils.File(
    getTestFilePath("data/untyped_text_with_cte_and_charset.eml")
  );
  const msgc = await open_message_from_file(file);

  // Be sure to view message body as Original HTML.
  msgc.MsgBodyAllowHTML();
  const textContent = msgc.content.document.documentElement.textContent;

  // Verify that Quoted-Printable and ISO-8859-1 were correctly applied.
  Assert.ok(
    textContent.includes("Liebe Grüße aus Österreich"),
    "Message body should be correctly decoded and converted"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

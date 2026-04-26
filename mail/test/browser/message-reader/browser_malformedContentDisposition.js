/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that a multipart/mixed message whose only text/plain part carries a
 * malformed Content-Disposition (a Content-Transfer-Encoding value used as
 * the disposition) still renders its body inline, instead of being hidden as
 * an unnamed attachment.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

add_task(async function testMalformedContentDispositionRendersInline() {
  const file = new FileUtils.File(
    getTestFilePath("data/malformed_content_disposition.eml")
  );
  const msgc = await open_message_from_file(file);

  Assert.ok(
    msgc.content.document.body.textContent.includes(
      "malformed Content-Disposition header"
    ),
    "body should render inline despite malformed Content-Disposition"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

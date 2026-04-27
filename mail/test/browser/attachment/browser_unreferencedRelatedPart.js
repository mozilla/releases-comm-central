/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

/**
 * Check that unreferenced Content-Disposition: inline parts inside
 * multipart/related surface as attachments with intact content. Size is used
 * as a proxy for intact content; the empty ZIP payload is binary-safe so the
 * same size can be asserted on Windows and macOS/Linux alike.
 */
add_task(async function test_multiple_unreferenced_related_parts_visible() {
  const file = new FileUtils.File(
    getTestFilePath("data/multiple_unreferenced_related_parts.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.equal(
    attachmentList.itemCount,
    2,
    "both unreferenced inline parts should surface as attachments"
  );

  const attachments = Array.from(
    { length: 2 },
    (_, i) => attachmentList.getItemAtIndex(i).attachment
  );

  for (const [i, attachment] of attachments.entries()) {
    Assert.equal(
      attachment.name,
      `dummy${i + 1}.zip`,
      `attachment ${i + 1} should be named dummy${i + 1}.zip`
    );
    Assert.equal(
      attachment.size,
      22,
      "attachment size should match 22-byte empty ZIP"
    );
    Assert.ok(!(await attachment.isEmpty()), "attachment should not be empty");
  }

  await BrowserTestUtils.closeWindow(msgc);
});

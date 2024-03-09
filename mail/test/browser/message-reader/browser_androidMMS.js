/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that opening a message with bad Content-Location is able to show
 * images correctly.
 * The test messsage has a bad Content-Location. This should not prevent
 * the html part from referring to the image parts by cid: correctly.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

add_task(async function testMMS() {
  const file = new FileUtils.File(
    getTestFilePath("data/bug1774805_android_mms.eml")
  );
  const msgc = await open_message_from_file(file);

  const imgs = msgc.content.document.querySelectorAll("img");
  // There are dottedline600.gif, tbmobilespace.gif x 3, footer.gif.
  Assert.equal(imgs.length, 5, "body should show all images");

  const lines = msgc.content.document.querySelectorAll(
    `img[src$="dottedline600.gif"]`
  );
  Assert.equal(lines.length, 1, "should have one dottedline600.gif");

  const spacers = msgc.content.document.querySelectorAll(
    `img[src$="tmobilespace.gif"]`
  );
  Assert.equal(spacers.length, 3, "should have three tmobilespace.gif");

  const footer = msgc.content.document.querySelectorAll(
    `img[src$="footer.gif"]`
  );
  Assert.equal(footer.length, 1, "should have one footer.gif");

  for (var img of imgs) {
    Assert.ok(
      img.naturalHeight > 0,
      `img should have naturalHeight: ${img.src}`
    );
    Assert.ok(img.naturalWidth > 0, `img should have naturalWidth: ${img.src}`);
  }

  Assert.ok(
    msgc.content.document.body.textContent.includes(
      "This is a sample SMS text to email"
    ),
    "Body should have the right text"
  );

  const aboutMessage = get_about_message(msgc);
  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.equal(
    attachmentList.childNodes.length,
    1,
    "should have one attachment"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

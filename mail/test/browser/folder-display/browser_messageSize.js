/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the size column of in the message list is formatted properly (e.g.
   0.1 KB, 1.2 KB, 12.3 KB, 123 KB, and likewise for MB and GB).
 */

"use strict";

var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  get_about_3pane,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("MessageSizeA");

  // Create messages with sizes in the byte, KB, and MB ranges.
  const bytemsg = create_message({ body: { body: " " } });

  const kbstring = "x ".repeat(1024 / 2);
  const kbmsg = create_message({ body: { body: kbstring } });

  const mbstring = kbstring.repeat(1024);
  const mbmsg = create_message({ body: { body: mbstring } });

  await add_message_to_folder([folder], bytemsg);
  await add_message_to_folder([folder], kbmsg);
  await add_message_to_folder([folder], mbmsg);
});

async function _help_test_message_size(index, unit) {
  await be_in_folder(folder);

  // Select the nth message
  const curMessage = await select_click_row(index);
  // Look at the size column's data
  const sizeStr = get_about_3pane().gDBView.cellTextForColumn(index, "sizeCol");

  // Note: this assumes that the numeric part of the size string is first
  const realSize = curMessage.messageSize;
  const abbrSize = parseFloat(sizeStr);

  if (isNaN(abbrSize)) {
    throw new Error("formatted size is not numeric: '" + sizeStr + "'");
  }
  if (Math.abs(realSize / Math.pow(1024, unit) - abbrSize) > 0.5) {
    throw new Error("size mismatch: '" + realSize + "' and '" + sizeStr + "'");
  }
}

add_task(async function test_byte_message_size() {
  await _help_test_message_size(2, 1);
});

add_task(async function test_kb_message_size() {
  await _help_test_message_size(1, 1);
});

add_task(async function test_mb_message_size() {
  await _help_test_message_size(0, 2);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

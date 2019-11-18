/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;

add_task(function setupModule(module) {
  folder = create_folder("MessageSizeA");

  // Create messages with sizes in the byte, KB, and MB ranges.
  let bytemsg = create_message({ body: { body: " " } });

  let kbstring = "x ".repeat(1024 / 2);
  let kbmsg = create_message({ body: { body: kbstring } });

  let mbstring = kbstring.repeat(1024);
  let mbmsg = create_message({ body: { body: mbstring } });

  add_message_to_folder(folder, bytemsg);
  add_message_to_folder(folder, kbmsg);
  add_message_to_folder(folder, mbmsg);
});

function _help_test_message_size(index, unit) {
  be_in_folder(folder);

  // Select the nth message
  let curMessage = select_click_row(index);
  // Look at the size column's data
  let tree = mc.folderDisplay.tree;
  let sizeCol = tree.columns.sizeCol;
  let sizeStr = tree.view.getCellText(index, sizeCol);

  // Note: this assumes that the numeric part of the size string is first
  let realSize = curMessage.messageSize;
  let abbrSize = parseFloat(sizeStr);

  if (isNaN(abbrSize)) {
    throw new Error("formatted size is not numeric: '" + sizeStr + "'");
  }
  if (Math.abs(realSize / Math.pow(1024, unit) - abbrSize) > 0.5) {
    throw new Error("size mismatch: '" + realSize + "' and '" + sizeStr + "'");
  }
}

add_task(function test_byte_message_size() {
  _help_test_message_size(0, 1);
});

add_task(function test_kb_message_size() {
  _help_test_message_size(1, 1);
});

add_task(function test_mb_message_size() {
  _help_test_message_size(2, 2);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

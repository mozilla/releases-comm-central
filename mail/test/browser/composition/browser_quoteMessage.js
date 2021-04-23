/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that in the compose window, Options > Quote Message works well for
 * non-UTF8 encoding.
 */

var {
  close_compose_window,
  open_compose_with_reply,
  get_compose_body,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  be_in_folder,
  create_folder,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folderToStoreMessages;

add_task(function setupModule(module) {
  folderToStoreMessages = create_folder("QuoteTestFolder");
});

add_task(async function test_quoteMessage() {
  be_in_folder(folderToStoreMessages);

  let file = new FileUtils.File(getTestFilePath("data/iso-2022-jp.eml"));
  let msgc = await open_message_from_file(file);
  // Copy the message to a folder, so that Quote Message menu item is enabled.
  let documentChild = msgc.e("messagepane").contentDocument.firstChild;
  msgc.rightClick(documentChild);
  await msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    { id: "mailContext-copyMenu" },
    { label: "Local Folders" },
    { label: "QuoteTestFolder" },
  ]);
  close_window(msgc);

  // Select message and click reply.
  select_click_row(0);
  let cwc = open_compose_with_reply();
  let composeBody = get_compose_body(cwc).textContent;
  Assert.equal(
    composeBody.match(/世界/g).length,
    1,
    "Message should be quoted by replying"
  );

  if (["linux", "win"].includes(AppConstants.platform)) {
    // Click Options > Quote Message.
    cwc.click(cwc.e("optionsMenu"));
    await cwc.click_menus_in_sequence(cwc.e("optionsMenuPopup"), [
      { id: "menu_quoteMessage" },
    ]);
    cwc.sleep(50);
  } else {
    // Native menubar is used on macOS, didn't find a way to click it.
    cwc.window.goDoCommand("cmd_quoteMessage");
    cwc.sleep(1);
  }
  composeBody = get_compose_body(cwc).textContent;
  Assert.equal(
    composeBody.match(/世界/g).length,
    2,
    "Message should be quoted again by Options > Quote Message."
  );

  close_compose_window(cwc);
});

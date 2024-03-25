/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that in the compose window, Options > Quote Message works well for
 * non-UTF8 encoding.
 */

var { close_compose_window, open_compose_with_reply, get_compose_body } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var folderToStoreMessages;

add_setup(async function () {
  folderToStoreMessages = await create_folder("QuoteTestFolder");
});

add_task(async function test_quoteMessage() {
  await be_in_folder(folderToStoreMessages);

  const file = new FileUtils.File(getTestFilePath("data/iso-2022-jp.eml"));
  const msgc = await open_message_from_file(file);
  // Copy the message to a folder, so that Quote Message menu item is enabled.
  const documentChild = msgc.content.document.documentElement;
  EventUtils.synthesizeMouseAtCenter(
    documentChild,
    { type: "contextmenu", button: 2 },
    documentChild.ownerGlobal
  );
  const aboutMessage = get_about_message(msgc);
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("mailContext"),
    [
      { id: "mailContext-copyMenu" },
      { label: "Local Folders" },
      { label: "QuoteTestFolder" },
    ]
  );
  await BrowserTestUtils.closeWindow(msgc);

  // Select message and click reply.
  await select_click_row(0);
  const cwc = await open_compose_with_reply();
  let composeBody = get_compose_body(cwc).textContent;
  Assert.equal(
    composeBody.match(/世界/g).length,
    1,
    "Message should be quoted by replying"
  );

  if (["linux", "win"].includes(AppConstants.platform)) {
    // Click Options > Quote Message.
    EventUtils.synthesizeMouseAtCenter(
      cwc.document.getElementById("optionsMenu"),
      {},
      cwc.document.getElementById("optionsMenu").ownerGlobal
    );
    await click_menus_in_sequence(
      cwc.document.getElementById("optionsMenuPopup"),
      [{ id: "menu_quoteMessage" }]
    );
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 50));
  } else {
    // Native menubar is used on macOS, didn't find a way to click it.
    cwc.goDoCommand("cmd_quoteMessage");
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  composeBody = get_compose_body(cwc).textContent;
  Assert.equal(
    composeBody.match(/世界/g).length,
    2,
    "Message should be quoted again by Options > Quote Message."
  );

  await close_compose_window(cwc);
});

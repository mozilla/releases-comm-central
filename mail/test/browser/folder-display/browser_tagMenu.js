/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { be_in_folder, create_folder, select_click_row, select_none } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function test_updateTagCommandsOnPopupShowing() {
  const folder = await create_folder("TagMenu");
  // The toolbar popup uses the same initializer as the native macOS menubar.
  const popup = document.getElementById("toolbarTagPopup");
  Assert.ok(popup, "The Tag popup should exist");
  registerCleanupFunction(async () => {
    if (popup.state != "closed") {
      const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
      popup.hidePopup();
      await hidden;
    }
    folder.deleteSelf(false);
  });
  const [messages] = await make_message_sets_in_folders(
    [folder],
    [{ count: 1 }]
  );
  const [tag] = MailServices.tags.getAllTags();
  messages.addTag(tag.key);

  await be_in_folder(folder);
  await select_none();
  document.commandDispatcher.updateCommands("command-context-changed");
  const commands = ["cmd_addTag", "cmd_removeTags"];
  for (const command of commands) {
    Assert.ok(
      document.getElementById(command).hasAttribute("disabled"),
      `${command} should be disabled when no message is selected`
    );
  }

  await select_click_row(0);

  const shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.openPopup(document.getElementById("unifiedToolbar"), "after_start");
  await shown;

  for (const command of commands) {
    Assert.ok(
      !document.getElementById(command).hasAttribute("disabled"),
      `${command} should be enabled when the Tag popup opens for a message`
    );
  }
  const addTag = popup.querySelector("#button-addNewTag");
  Assert.ok(addTag, "The New Tag menu item should exist");
  Assert.ok(
    !addTag.disabled,
    "New Tag should be enabled after selecting a message"
  );
  const removeTags = popup.querySelector("#button-tagRemoveAll");
  Assert.ok(removeTags, "The Remove All Tags menu item should exist");
  Assert.ok(
    !removeTags.disabled,
    "Remove All Tags should be enabled after selecting a tagged message"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  popup.hidePopup();
  await hidden;
});

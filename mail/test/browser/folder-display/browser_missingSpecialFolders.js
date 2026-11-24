/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_3pane,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

add_task(async function test_missingSpecialFolderAlerts() {
  const folder = await create_folder("MissingSpecialFolderSource");
  registerCleanupFunction(() => folder.deleteSelf(null));
  await make_message_sets_in_folders([folder], [{ count: 1 }]);
  const message = [...folder.messages][0];
  const [identity] = MailUtils.getIdentityForHeader(message);
  Assert.ok(identity, "the source message should have an identity");
  await be_in_folder(folder);
  await select_click_row(0, AccessibilityUtils);
  const messageWindow = get_about_message();

  const testCases = [
    [
      "cmd_archive",
      "archive_folder",
      "archives_folder_picker_mode",
      "archive-message-error-title",
      "archive-folder-missing",
    ],
  ];
  for (const [command, prefName, pickerMode, titleId, messageId] of testCases) {
    const commandWindow =
      command == "cmd_archive" ? get_about_3pane() : messageWindow;
    const missingURI = `${folder.rootFolder.URI}/MissingSpecialFolder`;
    await SpecialPowers.pushPrefEnv({
      set: [
        [`mail.identity.${identity.key}.${prefName}`, missingURI],
        [`mail.identity.${identity.key}.${pickerMode}`, "1"],
        [`mail.identity.${identity.key}.archive_enabled`, true],
      ],
    });
    const originalPrompt = Services.prompt;
    const alerts = [];
    Services.prompt = {
      QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
      alert(parent, title, text) {
        alerts.push({ parent, title, text });
      },
    };
    try {
      await commandWindow.commandController._callbackCommands[command]();
      const [title, text] = await commandWindow.document.l10n.formatValues([
        titleId,
        messageId,
      ]);
      Assert.equal(
        alerts.length,
        1,
        "the command should display one error alert"
      );
      Assert.equal(
        alerts[0].parent.browsingContext.id,
        commandWindow.browsingContext.id,
        "the alert should belong to the window running the command"
      );
      Assert.equal(
        alerts[0].title,
        title,
        "the alert should use the operation's localized title"
      );
      Assert.equal(
        alerts[0].text,
        text,
        "the alert should explain the missing destination"
      );
      Assert.equal(
        folder.getTotalMessages(false),
        1,
        "the source message should remain in its folder"
      );
      Assert.equal(
        identity.getCharAttribute(prefName),
        missingURI,
        "failure should preserve the configured destination"
      );
      Assert.equal(
        folder.server.getFolderFromURI(missingURI),
        null,
        "the command should leave the missing destination uncreated"
      );
    } finally {
      Services.prompt = originalPrompt;
      await SpecialPowers.popPrefEnv();
    }
  }
});

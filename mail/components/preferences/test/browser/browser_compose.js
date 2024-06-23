/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes(
    "paneCompose",
    "compositionMainCategory",
    {
      checkboxID: "addExtension",
      pref: "mail.forward_add_extension",
    },
    {
      checkboxID: "autoSave",
      pref: "mail.compose.autosave",
      enabledElements: ["#autoSaveInterval"],
    },
    {
      checkboxID: "mailWarnOnSendAccelKey",
      pref: "mail.warn_on_send_accel_key",
    },
    {
      checkboxID: "spellCheckBeforeSend",
      pref: "mail.SpellCheckBeforeSend",
    },
    {
      checkboxID: "inlineSpellCheck",
      pref: "mail.spellcheck.inline",
    }
  );

  await testCheckboxes(
    "paneCompose",
    "FontSelect",
    {
      checkboxID: "useReaderDefaults",
      pref: "msgcompose.default_colors",
      enabledInverted: true,
      enabledElements: [
        "#textColorLabel",
        "#textColorButton",
        "#backgroundColorLabel",
        "#backgroundColorButton",
      ],
    },
    {
      checkboxID: "defaultToParagraph",
      pref: "mail.compose.default_to_paragraph",
    }
  );

  await testCheckboxes(
    "paneCompose",
    "compositionAddressingCategory",
    {
      checkboxID: "addressingAutocomplete",
      pref: "mail.enable_autocomplete",
    },
    {
      checkboxID: "autocompleteLDAP",
      pref: "ldap_2.autoComplete.useDirectory",
      enabledElements: ["#directoriesList", "#editButton"],
    },
    {
      checkboxID: "emailCollectionOutgoing",
      pref: "mail.collect_email_address_outgoing",
      enabledElements: ["#localDirectoriesList"],
    }
  );
});

add_task(async () => {
  await testCheckboxes(
    "paneCompose",
    "compositionAttachmentsCategory",
    {
      checkboxID: "attachment_reminder_label",
      pref: "mail.compose.attachment_reminder",
      enabledElements: ["#attachment_reminder_button"],
    },
    {
      checkboxID: "enableThreshold",
      pref: "mail.compose.big_attachments.notify",
      enabledElements: ["#cloudFileThreshold"],
    }
  );
});

/**
 * Tests the attachment reminders dialog.
 */
add_task(async function testAttachmentReminderDialog() {
  Services.prefs.setBoolPref("mail.compose.attachment_reminder", true);
  const { prefsDocument } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("attachment_reminder_button"),
    "chrome://messenger/content/preferences/attachmentReminder.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});

/**
 * Tests the LDAP directories dialog.
 */
add_task(async function testLDAPDialog() {
  Services.prefs.setBoolPref("ldap_2.autoComplete.useDirectory", true);
  const { prefsDocument } = await openNewPrefsTab(
    "paneCompose",
    "compositionAddressingCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("editButton"),
    "chrome://messenger/content/addressbook/pref-editdirectories.xhtml",
    () => {}
  );
  await closePrefsTab();
});

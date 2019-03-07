/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  Services.prefs.setIntPref("mail.displayname.version", 1);

  await testCheckboxes("paneDisplay", "formattingTab", {
    checkboxID: "displayGlyph",
    pref: "mail.display_glyph",
  });

  await testCheckboxes("paneDisplay", "displayTab", {
    checkboxID: "automaticallyMarkAsRead",
    pref: "mailnews.mark_message_read.auto",
    enabledElements: ["#markAsReadAutoPreferences radio"],
  }, {
    checkboxID: "closeMsgOnMoveOrDelete",
    pref: "mail.close_message_window.on_delete",
  }, {
    checkboxID: "showCondensedAddresses",
    pref: "mail.showCondensedAddresses",
  });
});

add_task(async () => {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", true);

  await testRadioButtons("paneDisplay", "displayTab", {
    pref: "mailnews.mark_message_read.delay",
    states: [{
      id: "mark_read_immediately",
      prefValue: false,
    }, {
      id: "markAsReadAfterDelay",
      prefValue: true,
      enabledElements: ["#markAsReadDelay"],
    }],
  }, {
    pref: "mail.openMessageBehavior",
    states: [{
      id: "newTab",
      prefValue: 2,
    }, {
      id: "newWindow",
      prefValue: 0,
    }, {
      id: "existingWindow",
      prefValue: 1,
    }],
  });
});

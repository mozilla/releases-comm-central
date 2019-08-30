/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes(
    "paneChat",
    "chatPaneCategory",
    {
      checkboxID: "reportIdle",
      pref: "messenger.status.reportIdle",
      enabledElements: ["#autoAway", "#timeBeforeAway"],
    },
    {
      checkboxID: "sendTyping",
      pref: "purple.conversations.im.send_typing",
    },
    {
      checkboxID: "desktopChatNotifications",
      pref: "mail.chat.show_desktop_notifications",
    },
    {
      checkboxID: "getAttention",
      pref: "messenger.options.getAttentionOnNewMessages",
    },
    {
      checkboxID: "chatNotification",
      pref: "mail.chat.play_sound",
      enabledElements: ["#chatSoundType radio"],
    }
  );

  Services.prefs.setBoolPref("messenger.status.reportIdle", true);
  await testCheckboxes("paneChat", "chatPaneCategory", {
    checkboxID: "autoAway",
    pref: "messenger.status.awayWhenIdle",
    enabledElements: ["#defaultIdleAwayMessage"],
  });

  Services.prefs.setBoolPref("mail.chat.play_sound", true);
  await testRadioButtons("paneChat", "chatPaneCategory", {
    pref: "mail.chat.play_sound.type",
    states: [
      {
        id: "chatSoundSystemSound",
        prefValue: 0,
      },
      {
        id: "chatSoundCustom",
        prefValue: 1,
        enabledElements: ["#chatSoundUrlLocation", "#browseForChatSound"],
      },
    ],
  });
});

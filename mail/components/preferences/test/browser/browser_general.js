/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let tests = [{
    checkboxID: "mailnewsStartPageEnabled",
    pref: "mailnews.start_page.enabled",
    enabledElements: ["#mailnewsStartPageUrl", "#mailnewsStartPageUrl + button"],
  }];

  if (AppConstants.platform != "macosx") {
    tests.push({
      checkboxID: "newMailNotification",
      pref: "mail.biff.play_sound",
      enabledElements: ["#soundType radio"],
    });
    tests.push({
      checkboxID: "newMailNotificationAlert",
      pref: "mail.biff.show_alert",
      enabledElements: ["#customizeMailAlert"],
    });
  }

  await testCheckboxes("paneGeneral", undefined, ...tests);
});

add_task(async () => {
  if (AppConstants.platform == "macosx") {
    return;
  }

  Services.prefs.setBoolPref("mail.biff.play_sound", true);

  await testRadioButtons("paneGeneral", undefined, {
    pref: "mail.biff.play_sound.type",
    states: [{
      id: "system",
      prefValue: 0,
    }, {
      id: "custom",
      prefValue: 1,
      enabledElements: ["#soundUrlLocation", "#browseForSound"],
    }],
  });
});

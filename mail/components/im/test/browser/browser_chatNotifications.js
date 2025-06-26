/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../content/chat-messenger.js */

const { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);

const { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

add_setup(async () => {
  MockAlertsService.init();
});

registerCleanupFunction(() => {
  MockAlertsService.cleanup();
});

add_task(async function testNotificationsDisabled() {
  Services.prefs.setBoolPref("mail.chat.show_desktop_notifications", false);

  Services.obs.notifyObservers(
    {
      who: "notifier",
      alias: "Notifier",
      time: Date.now() / 1000 - 10,
      displayMessage: "<strong>lorem ipsum</strong>",
      action: false,
      conversation: {
        isChat: true,
      },
    },
    "new-directed-incoming-message"
  );

  await TestUtils.waitForTick();
  ok(!MockAlertsService.alert, "No alert shown when they are disabled");

  Services.prefs.setBoolPref("mail.chat.show_desktop_notifications", true);
  MockAlertsService.reset();

  const soundPlayed = TestUtils.topicObserved("play-chat-notification-sound");
  Services.obs.notifyObservers(
    {
      who: "notifier",
      alias: "Notifier",
      time: Date.now() / 1000 - 5,
      displayMessage: "",
      action: false,
      conversation: {
        isChat: true,
      },
    },
    "new-directed-incoming-message"
  );
  await soundPlayed;
  ok(!MockAlertsService.alert, "No alert shown with main window focused");

  MockAlertsService.reset();

  await openChatTab();

  Services.obs.notifyObservers(
    {
      who: "notifier",
      alias: "Notifier",
      time: Date.now() / 1000,
      displayMessage: "",
      action: false,
      conversation: {
        isChat: true,
      },
    },
    "new-directed-incoming-message"
  );
  await TestUtils.waitForTick();
  ok(
    !MockAlertsService.alert,
    "No alert shown, no sound with chat tab focused"
  );

  await closeChatTab();
});

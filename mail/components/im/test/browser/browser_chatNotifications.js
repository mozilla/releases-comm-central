/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../content/chat-messenger.js */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

let originalAlertsServiceCID;
let alertShown;
const reset = () => {
  alertShown = false;
};

add_setup(async () => {
  reset();
  class MockAlertsService {
    QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);
    showAlert() {
      alertShown = true;
    }
  }
  originalAlertsServiceCID = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    new MockAlertsService()
  );
});

registerCleanupFunction(() => {
  MockRegistrar.unregister(originalAlertsServiceCID);
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
  ok(!alertShown, "No alert shown when they are disabled");

  Services.prefs.setBoolPref("mail.chat.show_desktop_notifications", true);
  reset();

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
  ok(!alertShown, "No alert shown with main window focused");

  reset();

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
  ok(!alertShown, "No alert shown, no sound with chat tab focused");

  await closeChatTab();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
var { MockSound } = ChromeUtils.importESModule(
  "resource://testing-common/MockSound.sys.mjs"
);

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

add_task(async function test_sounds() {
  // To hear the sound in this test, add `--setpref media.volume_scale=1.0` to
  // your command. You won't hear the system sound as nsISound is mocked out.

  Services.prefs.setBoolPref("mail.chat.play_sound", true);
  Services.prefs.setIntPref("mail.chat.play_sound.type", 0);
  Services.prefs.setStringPref("mail.chat.play_sound.url", "");
  MockSound.init();

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneChat",
    "desktopChatNotifications"
  );
  const playSoundButton = prefsDocument.getElementById("playChatSound");
  const soundUrlTextbox = prefsDocument.getElementById("chatSoundUrlLocation");
  const browseButton = prefsDocument.getElementById("browseForChatSound");

  const [systemRadio, customRadio] = prefsDocument.querySelectorAll(
    "#chatSoundType radio"
  );
  Assert.ok(systemRadio.selected);
  Assert.ok(!playSoundButton.disabled);
  EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
  Assert.deepEqual(
    MockSound.played,
    [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
    "should have played the system sound"
  );
  MockSound.reset();

  EventUtils.synthesizeMouseAtCenter(customRadio, {}, prefsWindow);
  Assert.ok(playSoundButton.disabled);
  Assert.equal(soundUrlTextbox.value, "");

  const soundFile = new FileUtils.File(getTestFilePath("files/complete.oga"));
  const soundUrl = Services.io.newFileURI(soundFile).spec;
  MockFilePicker.init(window);
  MockFilePicker.setFiles([soundFile]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  EventUtils.synthesizeMouseAtCenter(browseButton, {}, prefsWindow);
  await TestUtils.waitForCondition(
    () => soundUrlTextbox.value,
    "waiting for sound url to be set"
  );
  Assert.equal(soundUrlTextbox.value, soundUrl);

  Assert.equal(Services.prefs.getIntPref("mail.chat.play_sound.type"), 1);
  const audioPromise = TestUtils.topicObserved("notification-audio-ended");
  EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
  const [audioElement] = await audioPromise;
  Assert.equal(MockSound.played.length, 0);
  Assert.equal(audioElement.src, soundUrl);

  await closePrefsTab();

  MockSound.cleanup();
  Services.prefs.clearUserPref("mail.chat.play_sound.type");
  Services.prefs.clearUserPref("mail.chat.play_sound.url");
});

add_task(async function testMessageStylePreview() {
  await openNewPrefsTab("paneChat", "chatPaneCategory");
  const conversationLoad = TestUtils.topicObserved("conversation-loaded");
  const [subject] = await conversationLoad;
  do {
    await BrowserTestUtils.waitForEvent(subject, "MessagesDisplayed");
  } while (subject.getPendingMessagesCount() > 0);
  const messageParent = subject.contentChatNode;
  let message = messageParent.firstElementChild;
  const messages = new Set();
  while (message) {
    ok(message._originalMsg);
    messages.add(message._originalMsg);
    message = message.nextElementSibling;
  }
  is(messages.size, 3, "All 3 messages displayed");
  await closePrefsTab();
});

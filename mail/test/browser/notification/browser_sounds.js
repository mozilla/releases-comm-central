/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the sound played when new mail is received.
 */

// To hear the sound in this test, add `--setpref media.volume_scale=1.0` to
// your command. You won't hear the system sound as nsISound is mocked out.

const { create_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
const { MockSound } = ChromeUtils.importESModule(
  "resource://testing-common/MockSound.sys.mjs"
);

const { MailNotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationManager.sys.mjs"
);

const bell = Services.io.newFileURI(
  new FileUtils.File(getTestFilePath("bell.oga"))
).spec;
const complete = Services.io.newFileURI(
  new FileUtils.File(getTestFilePath("complete.oga"))
).spec;
let testFolder;

add_setup(async function () {
  MockSound.init();
  testFolder = await create_folder("Sounds");
});

registerCleanupFunction(function () {
  MockSound.cleanup();
  Services.prefs.clearUserPref("mail.biff.play_sound");
  Services.prefs.clearUserPref("mail.biff.play_sound.type");
  Services.prefs.clearUserPref("mail.biff.play_sound.url");
  Services.prefs.clearUserPref("mail.feed.play_sound");
  Services.prefs.clearUserPref("mail.feed.play_sound.type");
  Services.prefs.clearUserPref("mail.feed.play_sound.url");

  const trash = testFolder.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  testFolder.deleteSelf(null);
  trash.emptyTrash(null);
});

/**
 * Test calling `playSound`. This should play the right sounds even if the
 * `play_sound` preference is false.
 */
add_task(async function testPlaySoundDirectly() {
  let promise;

  // Biff notification, system sound.

  Services.prefs.setBoolPref("mail.biff.play_sound", true);
  Services.prefs.setIntPref("mail.biff.play_sound.type", 0);
  Services.prefs.setStringPref("mail.biff.play_sound.url", bell);
  promise = promiseSystemSoundPlayed();
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.biff.play_sound")
  );
  await promise;

  // Biff notification, custom sound.

  Services.prefs.setIntPref("mail.biff.play_sound.type", 1);
  promise = promiseCustomSoundPlayed(bell);
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.biff.play_sound")
  );
  await promise;

  // RSS notification, system sound. Checks we're not playing the biff sound
  // by mistake.

  Services.prefs.setBoolPref("mail.feed.play_sound", true);
  Services.prefs.setIntPref("mail.feed.play_sound.type", 0);
  Services.prefs.setStringPref("mail.feed.play_sound.url", complete);
  promise = promiseSystemSoundPlayed();
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.feed.play_sound")
  );
  await promise;

  // RSS notification, custom sound. Checks we're not playing the biff sound
  // by mistake.

  Services.prefs.setIntPref("mail.feed.play_sound.type", 1);
  promise = promiseCustomSoundPlayed(complete);
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.feed.play_sound")
  );
  await promise;
});

/**
 * Test the sound when new mail is received and the `play_sound` preference
 * set to false. No sound should be played.
 */
add_task(async function testNoSoundOnBiff() {
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setIntPref("mail.biff.play_sound.type", 0);
  Services.prefs.setStringPref("mail.biff.play_sound.url", bell);

  const promise = promiseNothingPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;
});

/**
 * Test the sound when new mail is received and Windows is in "do not disturb"
 * mode. No sound should be played.
 */
add_task(async function testNoSoundOnBiffWithDND() {
  MockOSIntegration._inDoNotDisturbMode = true;

  Services.prefs.setBoolPref("mail.biff.play_sound", true);
  Services.prefs.setIntPref("mail.biff.play_sound.type", 0);
  Services.prefs.setStringPref("mail.biff.play_sound.url", complete);

  const promise = promiseNothingPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;

  MockOSIntegration._inDoNotDisturbMode = false;
});

/**
 * Test the system sound when new mail is received.
 */
add_task(async function testSystemSoundOnBiff() {
  Services.prefs.setBoolPref("mail.biff.play_sound", true);
  Services.prefs.setIntPref("mail.biff.play_sound.type", 0);
  Services.prefs.setStringPref("mail.biff.play_sound.url", bell);

  const promise = promiseSystemSoundPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;
});

/**
 * Test the custom sound when new mail is received.
 */
add_task(async function testCustomSoundOnBiff() {
  Services.prefs.setBoolPref("mail.biff.play_sound", true);
  Services.prefs.setIntPref("mail.biff.play_sound.type", 1);
  Services.prefs.setStringPref("mail.biff.play_sound.url", complete);

  const promise = promiseCustomSoundPlayed(complete);
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;
});

let gMsgMinutes = 9000;
async function make_gradually_newer_sets_in_folder(aFolder, aArgs) {
  gMsgMinutes -= 1;
  if (!aArgs.age) {
    for (const arg of aArgs) {
      arg.age = { minutes: gMsgMinutes };
    }
  }
  return make_message_sets_in_folders(aFolder, aArgs);
}

async function promiseNothingPlayed() {
  await promiseCustomSoundDidNotPlay();
  Assert.equal(
    MockSound.played.length,
    0,
    "the system sound should not have played"
  );
}

async function promiseSystemSoundPlayed() {
  await promiseCustomSoundDidNotPlay();
  Assert.deepEqual(
    MockSound.played,
    [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
    "should have played the system sound"
  );
  MockSound.reset();
}

async function promiseCustomSoundPlayed(soundURL) {
  return TestUtils.topicObserved("notification-audio-ended").then(function ([
    audioElement,
  ]) {
    Assert.equal(
      MockSound.played.length,
      0,
      "the system sound should not have played"
    );
    Assert.equal(
      audioElement.src,
      soundURL,
      "the custom sound should have played"
    );
  });
}

async function promiseCustomSoundDidNotPlay() {
  const deferred = Promise.withResolvers();
  function reportBadCustomSound(audioElement) {
    Assert.ok(false, `unexpected audio played: ${audioElement.src}`);
    deferred.reject();
  }
  try {
    Services.obs.addObserver(reportBadCustomSound, "notification-audio-ended");
    await Promise.race([
      deferred.promise,
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      new Promise(resolve => setTimeout(resolve, 1000)),
    ]);
  } finally {
    Services.obs.removeObserver(
      reportBadCustomSound,
      "notification-audio-ended"
    );
  }
}

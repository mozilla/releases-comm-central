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
  await SpecialPowers.pushPrefEnv({
    clear: [
      ["mail.biff.play_sound"],
      ["mail.biff.play_sound.type"],
      ["mail.biff.play_sound.url"],
      ["mail.feed.play_sound"],
      ["mail.feed.play_sound.type"],
      ["mail.feed.play_sound.url"],
    ],
  });

  MockSound.init();
  testFolder = await create_folder("Sounds");
});

registerCleanupFunction(function () {
  MockSound.cleanup();

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
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", bell],
      ["mail.feed.play_sound", true],
      ["mail.feed.play_sound.type", 0],
      ["mail.feed.play_sound.url", complete],
    ],
  });

  let promise;

  // Biff notification, system sound.

  promise = promiseSystemSoundPlayed();
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.biff.play_sound")
  );
  await promise;

  // Biff notification, custom sound.

  await SpecialPowers.pushPrefEnv({
    set: [["mail.biff.play_sound.type", 1]],
  });
  promise = promiseCustomSoundPlayed(bell);
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.biff.play_sound")
  );
  await promise;
  await SpecialPowers.popPrefEnv();

  // RSS notification, system sound. Checks we're not playing the biff sound
  // by mistake.

  promise = promiseSystemSoundPlayed();
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.feed.play_sound")
  );
  await promise;

  // RSS notification, custom sound. Checks we're not playing the biff sound
  // by mistake.
  await SpecialPowers.pushPrefEnv({
    set: [["mail.feed.play_sound.type", 1]],
  });
  promise = promiseCustomSoundPlayed(complete);
  MailNotificationManager.playSound(
    Services.prefs.getBranch("mail.feed.play_sound")
  );
  await promise;
  await SpecialPowers.popPrefEnv();

  // Restore the task's base sound preferences.
  await SpecialPowers.popPrefEnv();
});

/**
 * Test the sound when new mail is received and the `play_sound` preference
 * set to false. No sound should be played.
 */
add_task(async function testNoSoundOnBiff() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", false],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", bell],
    ],
  });

  const promise = promiseNothingPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;

  await SpecialPowers.popPrefEnv();
});

/**
 * Test the sound when new mail is received and Windows is in "do not disturb"
 * mode. No sound should be played.
 */
add_task(async function testNoSoundOnBiffWithDND() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", complete],
    ],
  });

  MockOSIntegration._inDoNotDisturbMode = true;

  const promise = promiseNothingPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;

  MockOSIntegration._inDoNotDisturbMode = false;
  await SpecialPowers.popPrefEnv();
});

/**
 * Test the system sound when new mail is received.
 */
add_task(async function testSystemSoundOnBiff() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", bell],
    ],
  });

  const promise = promiseSystemSoundPlayed();
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;
  await SpecialPowers.popPrefEnv();
});

/**
 * Test the custom sound when new mail is received.
 */
add_task(async function testCustomSoundOnBiff() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 1],
      ["mail.biff.play_sound.url", complete],
    ],
  });

  const promise = promiseCustomSoundPlayed(complete);
  await make_gradually_newer_sets_in_folder([testFolder], [{ count: 1 }]);
  await promise;

  await SpecialPowers.popPrefEnv();
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

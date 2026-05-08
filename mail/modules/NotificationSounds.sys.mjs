/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let audioElementWeak;

function observe() {
  // Stop playing a sound and clean up.
  audioElementWeak?.deref()?.pause();
  Services.obs.removeObserver(observe, "profile-before-change");
}
Services.obs.addObserver(observe, "profile-before-change");

export const NotificationSounds = {
  /**
   * Creates or reuses an Audio object and plays the sound at `url` from it.
   * Emits a "notification-audio-ended" observer service notification once the
   * sound stops.
   *
   * @param {string} url
   */
  playCustomSound(url) {
    let audioElement = audioElementWeak?.deref();
    if (audioElement && audioElement.src != url) {
      // A sound, that isn't the one we want, is already playing. Stop it.
      audioElement.pause();
      audioElement = null;
    }
    if (!audioElement) {
      // Create a new audio element for playing the sound.
      const win = Services.wm.getMostRecentWindow("mail:3pane");
      if (!win) {
        return;
      }
      audioElement = new win.Audio();
      if (Cu.isInAutomation) {
        audioElement.onended = function () {
          Services.obs.notifyObservers(
            audioElement,
            "notification-audio-ended"
          );
        };
      }
      audioElement.src = url;
      audioElementWeak = new WeakRef(audioElement);
    }

    // Go to the start and play the sound.
    audioElement.currentTime = 0;
    audioElement.play();
  },
};

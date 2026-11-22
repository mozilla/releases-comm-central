/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { makeMozIconImageSet } = ChromeUtils.importESModule(
  "resource:///modules/MozIconUtils.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailNotificationManager:
    "resource:///modules/MailNotificationManager.sys.mjs",
});

window.Preferences.addAll([
  { id: "mail.biff.show_tray_icon", type: "bool" },
  { id: "mail.biff.play_sound", type: "bool" },
  { id: "mail.biff.play_sound.type", type: "int" },
  { id: "mail.biff.play_sound.url", type: "string" },
  { id: "mail.biff.show_alert", type: "bool" },
  { id: "mail.biff.use_system_alert", type: "bool" },
]);

export const notificationsPane = {
  init() {
    document.getElementById("dockOptions")?.addEventListener("command", () => {
      this.configureDockOptions();
    });
    document
      .getElementById("customizeMailAlert")
      .addEventListener("command", () => {
        this.customizeMailAlert();
      });
    document
      .getElementById("newMailNotification")
      .addEventListener("command", () => {
        this.updatePlaySound();
      });
    document.getElementById("playSound").addEventListener("command", () => {
      this.previewSound();
    });
    document.getElementById("soundType")?.addEventListener("command", () => {
      this.updatePlaySound();
    });
    document
      .getElementById("browseForSound")
      .addEventListener("command", () => {
        this.browseForSoundFile();
      });

    this.updatePlaySound(
      !window.Preferences.get("mail.biff.play_sound").value,
      window.Preferences.get("mail.biff.play_sound.url").value,
      window.Preferences.get("mail.biff.play_sound.type").value
    );
    if (AppConstants.platform != "macosx") {
      this.updateShowAlert();
    }

    window.Preferences.addSyncFromPrefListener(
      document.getElementById("soundUrlLocation"),
      () => this.readSoundLocation()
    );

    window.Preferences.get("mail.biff.show_alert").on(
      "change",
      this.updateShowAlert
    );
  },

  customizeMailAlert() {
    window.gSubDialog.open(
      "chrome://messenger/content/preferences/notifications.xhtml",
      { features: "resizable=no" }
    );
  },

  configureDockOptions() {
    window.gSubDialog.open(
      "chrome://messenger/content/preferences/dockoptions.xhtml",
      { features: "resizable=no" }
    );
  },

  /**
   * Returns the local file for a file URL.
   *
   * @param {string} aFileURL - The file URL, or an empty string.
   * @returns {nsIFile|null} The local file, or null for an empty URL.
   */
  convertURLToLocalFile(aFileURL) {
    if (aFileURL) {
      return Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler)
        .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  /**
   * Updates the sound location field from the preference.
   * For a non-empty URL, also sets the file label and icon.
   */
  readSoundLocation() {
    const soundUrlLocation = document.getElementById("soundUrlLocation");
    soundUrlLocation.value = window.Preferences.get(
      "mail.biff.play_sound.url"
    ).value;
    if (soundUrlLocation.value) {
      soundUrlLocation.label = this.convertURLToLocalFile(
        soundUrlLocation.value
      ).leafName;
      soundUrlLocation.style.backgroundImage = makeMozIconImageSet(
        soundUrlLocation.label,
        16
      );
    }
  },

  previewSound() {
    lazy.MailNotificationManager.playSound(
      Services.prefs.getBranch("mail.biff.play_sound")
    );
  },

  /**
   * Opens a file picker and saves the selected sound URL to the preference.
   * Updates the sound location and controls after a file is selected.
   */
  async browseForSoundFile() {
    const filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );

    // if we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    const localFile = this.convertURLToLocalFile(
      document.getElementById("soundUrlLocation").value
    );
    if (localFile) {
      filePicker.displayDirectory = localFile.parent;
    }

    // XXX todo, persist the last sound directory and pass it in
    filePicker.init(
      window.browsingContext,
      await document.l10n.formatValue("sound-file-picker-title"),
      Ci.nsIFilePicker.modeOpen
    );
    filePicker.appendFilters(Ci.nsIFilePicker.filterAudio);
    filePicker.appendFilters(Ci.nsIFilePicker.filterAll);

    filePicker.open(result => {
      if (result != Ci.nsIFilePicker.returnOK || !filePicker.file) {
        return;
      }
      window.Preferences.get("mail.biff.play_sound.url").value =
        filePicker.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  /**
   * Updates the sound controls. On macOS, also updates the sound type pref.
   *
   * @param {boolean} [soundsDisabled] - Whether sounds are disabled. If
   *   omitted, reads the checkbox and sound URL from the document.
   * @param {string} [soundUrlLocation] - The selected sound file URL. Ignored
   *   when `soundsDisabled` is omitted.
   * @param {number|string} [soundType] - The sound type. On non-macOS
   *   platforms, reads the radio group if omitted.
   */
  updatePlaySound(soundsDisabled, soundUrlLocation, soundType) {
    if (soundsDisabled === undefined) {
      soundsDisabled = !document.getElementById("newMailNotification").checked;
      soundUrlLocation = document.getElementById("soundUrlLocation").value;
    }

    // The UI is different on OS X as the user can only choose between letting
    // the system play a default sound or setting a custom one. Therefore,
    // "soundTypeEl" does not exist on OS X.
    if (AppConstants.platform != "macosx") {
      const soundTypeEl = document.getElementById("soundType");
      if (soundType === undefined) {
        soundType = soundTypeEl.value;
      }

      soundTypeEl.disabled = soundsDisabled;
      document.getElementById("soundUrlLocation").disabled =
        soundsDisabled || soundType != 1;
      document.getElementById("browseForSound").disabled =
        soundsDisabled || soundType != 1;
      document.getElementById("playSound").disabled =
        soundsDisabled || (!soundUrlLocation && soundType != 0);
    } else {
      // On OS X, if there is no selected custom sound then default one will
      // be played. We keep consistency by disabling the "Play sound" checkbox
      // if the user hasn't selected a custom sound file yet.
      document.getElementById("newMailNotification").disabled =
        !soundUrlLocation;
      document.getElementById("playSound").disabled = !soundUrlLocation;
      // The sound type radiogroup is hidden, but we have to keep the
      // play_sound.type pref set appropriately.
      window.Preferences.get("mail.biff.play_sound.type").value =
        !soundsDisabled && soundUrlLocation ? 1 : 0;
    }
  },

  /**
   * Enables or disables alert controls based on the mail alert preference.
   */
  updateShowAlert() {
    const isAlertEnabled = window.Preferences.get("mail.biff.show_alert").value;
    // The button does not exist on all platforms.
    const customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled = !isAlertEnabled;
    }
    // The checkmark does not exist on all platforms.
    const systemNotification = document.getElementById(
      "useSystemNotificationAlert"
    );
    if (systemNotification) {
      systemNotification.disabled = !isAlertEnabled;
    }
  },
};

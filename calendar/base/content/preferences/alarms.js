/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gAlarmsPane */

/* import-globals-from ../calendar-ui-utils.js */
/* globals Preferences */

Preferences.addAll([
  { id: "calendar.alarms.playsound", type: "bool" },
  { id: "calendar.alarms.soundURL", type: "string" },
  { id: "calendar.alarms.soundType", type: "int" },
  { id: "calendar.alarms.show", type: "bool" },
  { id: "calendar.alarms.showmissed", type: "bool" },
  { id: "calendar.alarms.onforevents", type: "int" },
  { id: "calendar.alarms.onfortodos", type: "int" },
  { id: "calendar.alarms.eventalarmlen", type: "int" },
  { id: "calendar.alarms.eventalarmunit", type: "string" },
  { id: "calendar.alarms.todoalarmlen", type: "int" },
  { id: "calendar.alarms.todoalarmunit", type: "string" },
  { id: "calendar.alarms.defaultsnoozelength", type: "int" },
]);

/**
 * Global Object to hold methods for the alarms pref pane
 */
var gAlarmsPane = {
  /**
   * Initialize the alarms pref pane. Sets up dialog controls to match the
   * values set in prefs.
   */
  init() {
    // Enable/disable the alarm sound URL box and buttons
    this.alarmsPlaySoundPrefChanged();

    // Set the correct singular/plural for the time units
    updateMenuLabelsPlural("eventdefalarmlen", "eventdefalarmunit");
    updateMenuLabelsPlural("tododefalarmlen", "tododefalarmunit");
    updateUnitLabelPlural("defaultsnoozelength", "defaultsnoozelengthunit", "minutes");

    Preferences.addSyncFromPrefListener(document.getElementById("alarmSoundFileField"), () =>
      this.readSoundLocation()
    );
  },

  /**
   * Converts the given file url to a nsIFile
   *
   * @param aFileURL    A string with a file:// url.
   * @returns The corresponding nsIFile.
   */
  convertURLToLocalFile(aFileURL) {
    // Convert the file url into a nsIFile
    if (aFileURL) {
      const fph = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
      return fph.getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  /**
   * Handler function to be called when the calendar.alarms.soundURL pref has
   * changed. Updates the label in the dialog.
   */
  readSoundLocation() {
    const soundUrl = document.getElementById("alarmSoundFileField");
    soundUrl.value = Preferences.get("calendar.alarms.soundURL").value;
    if (soundUrl.value.startsWith("file://")) {
      soundUrl.label = gAlarmsPane.convertURLToLocalFile(soundUrl.value).leafName;
    } else {
      soundUrl.label = soundUrl.value;
    }
    soundUrl.style.backgroundImage = "url(moz-icon://" + soundUrl.label + "?size=16)";
    return undefined;
  },

  /**
   * Causes the default sound to be selected in the dialog controls
   */
  useDefaultSound() {
    const defaultSoundUrl = "chrome://calendar/content/sound.wav";
    Preferences.get("calendar.alarms.soundURL").value = defaultSoundUrl;
    document.getElementById("alarmSoundCheckbox").checked = true;
    this.readSoundLocation();
  },

  /**
   * Opens a filepicker to open a local sound for the alarm.
   */
  browseAlarm() {
    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    // If we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    const currentValue = Preferences.get("calendar.alarms.soundURL").value;
    if (currentValue && currentValue.startsWith("file://")) {
      const localFile = Services.io.newURI(currentValue).QueryInterface(Ci.nsIFileURL).file;
      picker.displayDirectory = localFile.parent;
    }

    const title = document.getElementById("bundlePreferences").getString("soundFilePickerTitle");

    picker.init(window.browsingContext, title, Ci.nsIFilePicker.modeOpen);
    picker.appendFilters(Ci.nsIFilePicker.filterAudio);
    picker.appendFilters(Ci.nsIFilePicker.filterAll);

    picker.open(rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !picker.file) {
        return;
      }
      Preferences.get("calendar.alarms.soundURL").value = picker.fileURL.spec;
      document.getElementById("alarmSoundCheckbox").checked = true;
      this.readSoundLocation();
    });
  },

  /**
   * Plays the alarm sound currently selected.
   */
  previewAlarm() {
    let soundUrl;
    if (Preferences.get("calendar.alarms.soundType").value == 0) {
      soundUrl = "chrome://calendar/content/sound.wav";
    } else {
      soundUrl = Preferences.get("calendar.alarms.soundURL").value;
    }
    const soundIfc = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
    let url;
    try {
      soundIfc.init();
      if (soundUrl && soundUrl.length && soundUrl.length > 0) {
        url = Services.io.newURI(soundUrl);
        soundIfc.play(url);
      } else {
        soundIfc.beep();
      }
    } catch (ex) {
      dump("alarms.js previewAlarm Exception caught! " + ex + "\n");
    }
  },

  /**
   * Handler function to call when the calendar.alarms.playsound preference
   * has been changed. Updates the disabled state of fields that depend on
   * playing a sound.
   */
  alarmsPlaySoundPrefChanged() {
    const alarmsPlaySoundPref = Preferences.get("calendar.alarms.playsound");
    const alarmsSoundType = Preferences.get("calendar.alarms.soundType");

    for (const item of ["alarmSoundType", "calendar.prefs.alarm.sound.play"]) {
      document.getElementById(item).disabled = !alarmsPlaySoundPref.value;
    }

    for (const item of ["alarmSoundFileField", "calendar.prefs.alarm.sound.browse"]) {
      document.getElementById(item).disabled =
        alarmsSoundType.value != 1 || !alarmsPlaySoundPref.value;
    }
  },
};

Preferences.get("calendar.alarms.playsound").on("change", gAlarmsPane.alarmsPlaySoundPrefChanged);
Preferences.get("calendar.alarms.soundType").on("change", gAlarmsPane.alarmsPlaySoundPrefChanged);
Preferences.get("calendar.alarms.soundURL").on("change", gAlarmsPane.readSoundLocation);

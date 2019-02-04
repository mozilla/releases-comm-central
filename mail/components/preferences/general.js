/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

document.getElementById("paneGeneral")
        .addEventListener("paneload", function() { gGeneralPane.init(); });

var gGeneralPane = {
  mPane: null,
  mStartPageUrl: "",

  init() {
    this.mPane = document.getElementById("paneGeneral");

    this.updateStartPage();
    this.updatePlaySound();
    this.updateCustomizeAlert();
    this.updateWebSearch();
  },

  /**
   * Restores the default start page as the user's start page
   */
  restoreDefaultStartPage() {
    var startPage = document.getElementById("mailnews.start_page.url");
    startPage.value = startPage.defaultValue;
  },

  /**
   * Returns a formatted url corresponding to the value of mailnews.start_page.url
   * Stores the original value of mailnews.start_page.url
   */
  readStartPageUrl() {
    var pref = document.getElementById("mailnews.start_page.url");
    this.mStartPageUrl = pref.value;
    return Services.urlFormatter.formatURL(this.mStartPageUrl);
  },

  /**
   * Returns the value of the mailnews start page url represented by the UI.
   * If the url matches the formatted version of our stored value, then
   * return the unformatted url.
   */
  writeStartPageUrl() {
    var startPage = document.getElementById("mailnewsStartPageUrl");
    return Services.urlFormatter.formatURL(this.mStartPageUrl) == startPage.value ? this.mStartPageUrl : startPage.value;
  },

  customizeMailAlert() {
    gSubDialog.open("chrome://messenger/content/preferences/notifications.xul",
                    "resizable=no");
  },

  configureDockOptions() {
    gSubDialog.open("chrome://messenger/content/preferences/dockoptions.xul",
                    "resizable=no");
  },

  convertURLToLocalFile(aFileURL) {
    // convert the file url into a nsIFile
    if (aFileURL) {
      return Services.io
                     .getProtocolHandler("file")
                     .QueryInterface(Ci.nsIFileProtocolHandler)
                     .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  readSoundLocation() {
    var soundUrlLocation = document.getElementById("soundUrlLocation");
    soundUrlLocation.value = document.getElementById("mail.biff.play_sound.url").value;
    if (soundUrlLocation.value) {
      soundUrlLocation.label = this.convertURLToLocalFile(soundUrlLocation.value).leafName;
      soundUrlLocation.style.backgroundImage = "url(moz-icon://" + soundUrlLocation.label + "?size=16)";
    }
    return undefined;
  },

  previewSound() {
    let sound = Cc["@mozilla.org/sound;1"]
                  .createInstance(Ci.nsISound);

    let soundLocation;
    // soundType radio-group isn't used for macOS so it is not in the XUL file
    // for the platform.
    soundLocation = (AppConstants.platform == "macosx" ||
                     document.getElementById("soundType").value == 1) ?
                       document.getElementById("soundUrlLocation").value : "";

    if (!soundLocation.includes("file://")) {
      // User has not set any custom sound file to be played
      sound.playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
    } else {
      // User has set a custom audio file to be played along the alert.
      sound.play(Services.io.newURI(soundLocation));
    }
  },

  browseForSoundFile() {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    // if we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    var localFile = this.convertURLToLocalFile(document.getElementById("soundUrlLocation").value);
    if (localFile)
      fp.displayDirectory = localFile.parent;

    // XXX todo, persist the last sound directory and pass it in
    fp.init(window, document.getElementById("bundlePreferences").getString("soundFilePickerTitle"), nsIFilePicker.modeOpen);

    // On Mac, allow AIFF and CAF files too
    var bundlePrefs = document.getElementById("bundlePreferences");
    var soundFilesText = bundlePrefs.getString("soundFilesDescription");
    if (AppConstants.platform == "macosx")
      fp.appendFilter(soundFilesText, "*.wav; *.aif; *.aiff; *.caf; *.mp3");
    else if (AppConstants.platform == "linux")
      fp.appendFilter(soundFilesText, "*.wav; *.ogg");
    else
      fp.appendFilter(soundFilesText, "*.wav");

    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      // convert the nsIFile into a nsIFile url
      document.getElementById("mail.biff.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound() {
    // Update the sound type radio buttons based on the state of the
    // play sound checkbox.
    var soundsDisabled = !document.getElementById("newMailNotification").checked;
    var soundUrlLocation = document.getElementById("soundUrlLocation").value;

    // The UI is different on OS X as the user can only choose between letting
    // the system play a default sound or setting a custom one. Therefore,
    // "soundTypeEl" does not exist on OS X.
    if (AppConstants.platform != "macosx") {
      var soundTypeEl = document.getElementById("soundType");
      soundTypeEl.disabled = soundsDisabled;
      document.getElementById("soundUrlLocation").disabled =
        soundsDisabled || soundTypeEl.value != 1;
      document.getElementById("playSound").disabled =
        soundsDisabled || (!soundUrlLocation && soundTypeEl.value != 0);
    } else {
      // On OS X, if there is no selected custom sound then default one will
      // be played. We keep consistency by disabling the "Play sound" checkbox
      // if the user hasn't selected a custom sound file yet.
      document.getElementById("newMailNotification").disabled = !soundUrlLocation;
      document.getElementById("playSound").disabled = !soundUrlLocation;
      // The sound type radiogroup is hidden, but we have to keep the
      // play_sound.type pref set appropriately.
      document.getElementById("mail.biff.play_sound.type").value =
        (!soundsDisabled && soundUrlLocation) ? 1 : 0;
    }
  },

  updateStartPage() {
    document.getElementById("mailnewsStartPageUrl").disabled =
      !document.getElementById("mailnewsStartPageEnabled").checked;
  },

  updateCustomizeAlert() {
    // The button does not exist on all platforms.
    let customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled =
        !document.getElementById("newMailNotificationAlert").checked;
    }
  },

  updateWebSearch() {
    Services.search.init().then(async () => {
      let defaultEngine = await Services.search.getDefault();
      let engineList = document.getElementById("defaultWebSearch");
      for (let engine of await Services.search.getVisibleEngines()) {
        let item = engineList.appendItem(engine.name);
        item.engine = engine;
        item.className = "menuitem-iconic";
        item.setAttribute("image", engine.iconURI ? engine.iconURI.spec :
          "resource://gre-resources/broken-image.png"
        );
        if (engine == defaultEngine) {
          engineList.selectedItem = item;
        }
      }

      engineList.addEventListener("command", () => {
        Services.search.setDefault(engineList.selectedItem.engine);
      });
    });
  },
};

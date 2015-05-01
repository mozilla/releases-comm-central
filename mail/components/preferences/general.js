/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gGeneralPane = {
  mPane: null,
  mStartPageUrl: "",

  _loadInContent: Services.prefs.getBoolPref("mail.preferences.inContent"),

  init: function ()
  {
    this.mPane = document.getElementById("paneGeneral");

    this.updateStartPage();
    this.updatePlaySound();
    this.updateCustomizeAlert();
    this.updateWebSearch();

    if (this._loadInContent) {
      gSubDialog.init();
    }
  },

  /**
   * Restores the default start page as the user's start page
   */
  restoreDefaultStartPage: function()
  {
    var startPage = document.getElementById("mailnews.start_page.url");
    startPage.value = startPage.defaultValue;
  },

  /**
   * Returns a formatted url corresponding to the value of mailnews.start_page.url
   * Stores the original value of mailnews.start_page.url
   */
  readStartPageUrl: function()
  {
    var pref = document.getElementById("mailnews.start_page.url");
    this.mStartPageUrl = pref.value;
    return Services.urlFormatter.formatURL(this.mStartPageUrl);
  },

  /**
   * Returns the value of the mailnews start page url represented by the UI.
   * If the url matches the formatted version of our stored value, then
   * return the unformatted url.
   */
  writeStartPageUrl: function()
  {
    var startPage = document.getElementById('mailnewsStartPageUrl');
    return Services.urlFormatter.formatURL(this.mStartPageUrl) == startPage.value ? this.mStartPageUrl : startPage.value;
  },

  customizeMailAlert: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/preferences/notifications.xul",
                      "resizable=no");
    } else {
      document.documentElement
              .openSubDialog("chrome://messenger/content/preferences/notifications.xul",
                              "", null);
    }
  },

  configureDockOptions: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/preferences/dockoptions.xul",
                      "resizable=no");
    } else {
      document.documentElement
              .openSubDialog("chrome://messenger/content/preferences/dockoptions.xul",
                              "", null);
    }
  },

  convertURLToLocalFile: function(aFileURL)
  {
    // convert the file url into a nsILocalFile
    if (aFileURL)
    {
      return Services.io
                     .getProtocolHandler("file")
                     .QueryInterface(Components.interfaces.nsIFileProtocolHandler)
                     .getFileFromURLSpec(aFileURL);
    }
    else
      return null;
  },

  readSoundLocation: function()
  {
    var soundUrlLocation = document.getElementById("soundUrlLocation");
    soundUrlLocation.value = document.getElementById("mail.biff.play_sound.url").value;
    if (soundUrlLocation.value)
    {
      soundUrlLocation.label = this.convertURLToLocalFile(soundUrlLocation.value).leafName;
      soundUrlLocation.image = "moz-icon://" + soundUrlLocation.label + "?size=16";
    }
    return undefined;
  },

  previewSound: function ()
  {
    let sound = Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);

    var soundLocation;
    soundLocation = document.getElementById('soundType').value == 1 ?
                    document.getElementById('soundUrlLocation').value : "";

    if (!soundLocation.includes("file://")) {
      if (Services.appinfo.OS == "Darwin") // OS X
        sound.beep();
      else
        sound.playEventSound(Components.interfaces.nsISound.EVENT_NEW_MAIL_RECEIVED);
    } else {
      sound.play(Services.io.newURI(soundLocation, null, null));
    }
  },

  browseForSoundFile: function ()
  {
    const nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    // if we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    var localFile = this.convertURLToLocalFile(document.getElementById('soundUrlLocation').value);
    if (localFile)
      fp.displayDirectory = localFile.parent;

    // XXX todo, persist the last sound directory and pass it in
    fp.init(window, document.getElementById("bundlePreferences").getString("soundFilePickerTitle"), nsIFilePicker.modeOpen);

    // On Mac, allow AIFF and CAF files too
    var bundlePrefs = document.getElementById("bundlePreferences");
    var soundFilesText = bundlePrefs.getString("soundFilesDescription");
    if (Application.platformIsMac)
      fp.appendFilter(soundFilesText, "*.wav; *.aif; *.aiff; *.caf");
    else if (Application.platformIsLinux)
      fp.appendFilter(soundFilesText, "*.wav; *.ogg");
    else
      fp.appendFilter(soundFilesText, "*.wav");

    var ret = fp.show();
    if (ret == nsIFilePicker.returnOK)
    {
      // convert the nsILocalFile into a nsIFile url
      document.getElementById("mail.biff.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    }
  },

  updatePlaySound: function()
  {
    // update the sound type radio buttons based on the state of the play sound checkbox
    var soundsDisabled = !document.getElementById('newMailNotification').checked;
    var soundTypeEl = document.getElementById('soundType');
    var soundUrlLocation = document.getElementById('soundUrlLocation').value;
    soundTypeEl.disabled = soundsDisabled;
    document.getElementById('browseForSound').disabled = soundsDisabled || soundTypeEl.value != 1;
    document.getElementById('playSound').disabled = soundsDisabled || (!soundUrlLocation && soundTypeEl.value != 0);
  },

  updateStartPage: function()
  {
    document.getElementById("mailnewsStartPageUrl").disabled =
      !document.getElementById("mailnewsStartPageEnabled").checked;
  },

  updateCustomizeAlert: function()
  {
    // The button does not exist on all platforms.
    let customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled =
        !document.getElementById("newMailNotificationAlert").checked;
    }
  },

  updateWebSearch: function() {
    Services.search.init({
      onInitComplete: function() {
        let engineList = document.getElementById("defaultWebSearch");
        for (let engine of Services.search.getVisibleEngines()) {
          let item = engineList.appendItem(engine.name);
          item.engine = engine;
          item.className = "menuitem-iconic";
          item.setAttribute(
            "image", engine.iconURI ? engine.iconURI.spec :
                     "resource://gre-resources/broken-image.png"
          );
          if (engine == Services.search.currentEngine)
            engineList.selectedItem = item;
        }

        engineList.addEventListener("command", function() {
          Services.search.currentEngine = engineList.selectedItem.engine;
        });
      }
    });
  },
};

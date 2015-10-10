/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

var gChatPane = {
  init: function ()
  {
    this.updateDisabledState();
  },

  updateDisabledState: function ()
  {
    let broadcaster = document.getElementById("idleReportingEnabled");
    if (document.getElementById("messenger.status.reportIdle").value) {
      broadcaster.removeAttribute("disabled");
      this.updateMessageDisabledState();
    }
    else
      broadcaster.setAttribute("disabled", "true");
  },

  updateMessageDisabledState: function ()
  {
    let textbox = document.getElementById("defaultIdleAwayMessage");
    if (document.getElementById("messenger.status.awayWhenIdle").value)
      textbox.removeAttribute("disabled");
    else
      textbox.setAttribute("disabled", "true");
  },

  convertURLToLocalFile: function(aFileURL)
  {
    // convert the file url into a nsILocalFile
    if (aFileURL)
    {
      return Services.io.getProtocolHandler("file")
                        .QueryInterface(Ci.nsIFileProtocolHandler)
                        .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  readSoundLocation: function()
  {
    let chatSoundUrlLocation = document.getElementById("chatSoundUrlLocation");
    chatSoundUrlLocation.value = document.getElementById("mail.chat.play_sound.url").value;
    if (chatSoundUrlLocation.value)
    {
      chatSoundUrlLocation.label = this.convertURLToLocalFile(chatSoundUrlLocation.value).leafName;
      chatSoundUrlLocation.image = "moz-icon://" + chatSoundUrlLocation.label + "?size=16";
    }
  },

  previewSound: function ()
  {
    let sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);

    let soundLocation = document.getElementById("chatSoundType").value == 1 ?
                        document.getElementById("chatSoundUrlLocation").value :
                        "";

    // This should be in sync with the code in nsStatusBarBiffManager::PlayBiffSound.
    if (!soundLocation.startsWith("file://")) {
      if (Services.appinfo.OS == "Darwin") // OS X
        sound.beep();
      else
        sound.playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
    } else {
      sound.play(Services.io.newURI(soundLocation, null, null));
    }
  },

  browseForSoundFile: function ()
  {
    const nsIFilePicker = Ci.nsIFilePicker;
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    // If we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    let localFile = this.convertURLToLocalFile(
      document.getElementById("chatSoundUrlLocation").value);
    if (localFile)
      fp.displayDirectory = localFile.parent;

    // XXX todo, persist the last sound directory and pass it in
    fp.init(window, document.getElementById("bundlePreferences")
                            .getString("soundFilePickerTitle"), nsIFilePicker.modeOpen);

    // On Mac, allow AIFF and CAF files too
    let bundlePrefs = document.getElementById("bundlePreferences");
    let soundFilesText = bundlePrefs.getString("soundFilesDescription");
    if (Application.platformIsMac)
      fp.appendFilter(soundFilesText, "*.wav; *.aif; *.aiff; *.caf");
    else if (Application.platformIsLinux)
      fp.appendFilter(soundFilesText, "*.wav; *.ogg");
    else
      fp.appendFilter(soundFilesText, "*.wav");

    let ret = fp.show();
    if (ret == nsIFilePicker.returnOK)
    {
      // convert the nsILocalFile into a nsIFile url
      document.getElementById("mail.chat.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    }
  },

  updatePlaySound: function()
  {
    // update the sound type radio buttons based on the state of the play sound checkbox
    let soundsDisabled = !document.getElementById("chatNotification").checked;
    let soundTypeEl = document.getElementById("chatSoundType");
    let chatSoundUrlLocation = document.getElementById("chatSoundUrlLocation").value;
    soundTypeEl.disabled = soundsDisabled;
    document.getElementById("browseForChatSound").disabled =
      soundsDisabled || (soundTypeEl.value != 1);
    document.getElementById("playChatSound").disabled =
      soundsDisabled || (!chatSoundUrlLocation && soundTypeEl.value != 0);
  }
};

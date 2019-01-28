/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */
// messagestyle.js
/* globals previewObserver */

var gChatPane = {
  mInitialized: false,

  init() {
    this.updateDisabledState();
    this.updatePlaySound();

    let preference = document.getElementById("mail.preferences.chat.selectedTabIndex");
    this.mTabBox = document.getElementById("chatPrefs");
    this.mTabBox.selectedIndex = preference.value != null ? preference.value : 0;

    window.addEventListener("paneSelected", this.paneSelectionChanged);

    this.mInitialized = true;
  },

  paneSelectionChanged() {
    gChatPane.initPreview(); // Can't use "this", as it's probably not gChatPane.
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      document.getElementById("mail.preferences.chat.selectedTabIndex")
              .valueFromPreferences = this.mTabBox.selectedIndex;
    }

    this.initPreview();
  },

  initPreview() {
    // We add this browser only when really necessary.
    let previewDeck = document.getElementById("previewDeck");
    if (previewDeck.querySelector("browser")) {
      return;
    }
    if (!("getCurrentPaneID" in window) || getCurrentPaneID() != "paneChat") {
      return;
    }
    if (this.mTabBox.selectedIndex != 1) {
      return;
    }

    window.removeEventListener("paneSelected", this.paneSelectionChanged);

    let browser = document.createElement("browser", { is: "conversation-browser" });
    browser.setAttribute("id", "previewbrowser");
    browser.setAttribute("type", "content");
    browser.setAttribute("flex", "1");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    previewDeck.appendChild(browser);
    previewObserver.load();
  },

  updateDisabledState() {
    let checked = document.getElementById("messenger.status.reportIdle").value;
    document.querySelectorAll(".idle-reporting-enabled").forEach(e => {
      e.disabled = !checked;
    });
  },

  updateMessageDisabledState() {
    let textbox = document.getElementById("defaultIdleAwayMessage");
    if (document.getElementById("messenger.status.awayWhenIdle").value)
      textbox.removeAttribute("disabled");
    else
      textbox.setAttribute("disabled", "true");
  },

  convertURLToLocalFile(aFileURL) {
    // convert the file url into a nsIFile
    if (aFileURL) {
      return Services.io.getProtocolHandler("file")
                        .QueryInterface(Ci.nsIFileProtocolHandler)
                        .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  readSoundLocation() {
    let chatSoundUrlLocation = document.getElementById("chatSoundUrlLocation");
    chatSoundUrlLocation.value = document.getElementById("mail.chat.play_sound.url").value;
    if (chatSoundUrlLocation.value) {
      chatSoundUrlLocation.label = this.convertURLToLocalFile(chatSoundUrlLocation.value).leafName;
      chatSoundUrlLocation.style.backgroundImage = "url(moz-icon://" + chatSoundUrlLocation.label + "?size=16)";
    }
  },

  previewSound() {
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
      sound.play(Services.io.newURI(soundLocation));
    }
  },

  browseForSoundFile() {
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
    if (AppConstants.platform == "macosx")
      fp.appendFilter(soundFilesText, "*.wav; *.aif; *.aiff; *.caf");
    else if (AppConstants.platform == "linux")
      fp.appendFilter(soundFilesText, "*.wav; *.ogg");
    else
      fp.appendFilter(soundFilesText, "*.wav");

    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK) {
        return;
      }

      // convert the nsIFile into a nsIFile url
      document.getElementById("mail.chat.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound() {
    // update the sound type radio buttons based on the state of the play sound checkbox
    let soundsDisabled = !document.getElementById("chatNotification").checked;
    let soundTypeEl = document.getElementById("chatSoundType");
    let chatSoundUrlLocation = document.getElementById("chatSoundUrlLocation").value;
    soundTypeEl.disabled = soundsDisabled;
    document.getElementById("chatSoundUrlLocation").disabled =
      soundsDisabled || (soundTypeEl.value != 1);
    document.getElementById("playChatSound").disabled =
      soundsDisabled || (!chatSoundUrlLocation && soundTypeEl.value != 0);
  },
};

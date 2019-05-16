/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
// messagestyle.js
/* globals previewObserver */

Preferences.addAll([
  { id: "mail.preferences.chat.selectedTabIndex", type: "int" },
  { id: "messenger.startup.action", type: "int" },
  { id: "purple.conversations.im.send_typing", type: "bool" },
  { id: "messenger.status.reportIdle", type: "bool" },
  { id: "messenger.status.timeBeforeIdle", type: "int" },
  { id: "messenger.status.awayWhenIdle", type: "bool" },
  { id: "messenger.status.defaultIdleAwayMessage", type: "wstring" },
  { id: "purple.logging.log_chats", type: "bool" },
  { id: "purple.logging.log_ims", type: "bool" },
  { id: "purple.logging.log_system", type: "bool" },
  { id: "mail.chat.show_desktop_notifications", type: "bool" },
  { id: "mail.chat.notification_info", type: "int" },
  { id: "mail.chat.play_sound", type: "bool" },
  { id: "mail.chat.play_sound.type", type: "int" },
  { id: "mail.chat.play_sound.url", type: "string" },
  { id: "messenger.options.getAttentionOnNewMessages", type: "bool" },
  { id: "messenger.options.messagesStyle.theme", type: "string" },
  { id: "messenger.options.messagesStyle.variant", type: "string" },
  { id: "messenger.options.messagesStyle.showHeader", type: "bool" },
]);

document.getElementById("paneChat")
        .addEventListener("paneload", function() { gChatPane.init(); });

var gChatPane = {
  mInitialized: false,

  init() {
    this.updateDisabledState();
    this.updateMessageDisabledState();
    this.updatePlaySound();

    let preference = Preferences.get("mail.preferences.chat.selectedTabIndex");
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
      Preferences.get("mail.preferences.chat.selectedTabIndex")
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

    let browser = document.createXULElement("browser", { is: "conversation-browser" });
    browser.setAttribute("id", "previewbrowser");
    browser.setAttribute("type", "content");
    browser.setAttribute("flex", "1");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    previewDeck.appendChild(browser);
    previewObserver.load();
  },

  updateDisabledState() {
    let checked = Preferences.get("messenger.status.reportIdle").value;
    document.querySelectorAll(".idle-reporting-enabled").forEach(e => {
      e.disabled = !checked;
    });
  },

  updateMessageDisabledState() {
    let textbox = document.getElementById("defaultIdleAwayMessage");
    if (Preferences.get("messenger.status.awayWhenIdle").value)
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
    chatSoundUrlLocation.value = Preferences.get("mail.chat.play_sound.url").value;
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
    fp.appendFilters(Ci.nsIFilePicker.filterAudio);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK) {
        return;
      }

      // convert the nsIFile into a nsIFile url
      Preferences.get("mail.chat.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound() {
    let soundsEnabled = Preferences.get("mail.chat.play_sound").value;
    let soundTypeValue = Preferences.get("mail.chat.play_sound.type").value;
    let soundUrlLocation = Preferences.get("mail.chat.play_sound.url").value;

    document.getElementById("chatSoundType").disabled = !soundsEnabled;
    document.getElementById("chatSoundUrlLocation").disabled =
      !soundsEnabled || (soundTypeValue != 1);
    document.getElementById("playChatSound").disabled =
      !soundsEnabled || (!soundUrlLocation && soundTypeValue != 0);
  },
};

Preferences.get("messenger.status.reportIdle").on("change", gChatPane.updateDisabledState);
Preferences.get("messenger.status.awayWhenIdle").on("change", gChatPane.updateMessageDisabledState);
Preferences.get("mail.chat.play_sound").on("change", gChatPane.updatePlaySound);
Preferences.get("mail.chat.play_sound.type").on("change", gChatPane.updatePlaySound);

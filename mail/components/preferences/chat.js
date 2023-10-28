/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
// messagestyle.js
/* globals previewObserver */

Preferences.addAll([
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
]);

var gChatPane = {
  init() {
    this.updateDisabledState();
    this.updateMessageDisabledState();
    this.updatePlaySound();
    this.initPreview();

    const element = document.getElementById("timeBeforeAway");
    Preferences.addSyncFromPrefListener(
      element,
      () =>
        Preferences.get("messenger.status.timeBeforeIdle")
          .valueFromPreferences / 60
    );
    Preferences.addSyncToPrefListener(element, element => element.value * 60);
    Preferences.addSyncFromPrefListener(
      document.getElementById("chatSoundUrlLocation"),
      () => this.readSoundLocation()
    );
  },

  initPreview() {
    // We add this browser only when really necessary.
    const previewBox = document.getElementById("previewBox");
    if (previewBox.querySelector("browser")) {
      return;
    }

    document.getElementById("noPreviewScreen").hidden = true;
    const browser = document.createXULElement("browser", {
      is: "conversation-browser",
    });
    browser.setAttribute("id", "previewbrowser");
    browser.setAttribute("type", "content");
    browser.setAttribute("flex", "1");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    previewBox.appendChild(browser);
    previewObserver.load();
  },

  updateDisabledState() {
    const checked = Preferences.get("messenger.status.reportIdle").value;
    document.querySelectorAll(".idle-reporting-enabled").forEach(e => {
      e.disabled = !checked;
    });
  },

  updateMessageDisabledState() {
    const textbox = document.getElementById("defaultIdleAwayMessage");
    textbox.toggleAttribute(
      "disabled",
      !Preferences.get("messenger.status.awayWhenIdle").value
    );
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
    const chatSoundUrlLocation = document.getElementById(
      "chatSoundUrlLocation"
    );
    chatSoundUrlLocation.value = Preferences.get(
      "mail.chat.play_sound.url"
    ).value;
    if (chatSoundUrlLocation.value) {
      chatSoundUrlLocation.label = this.convertURLToLocalFile(
        chatSoundUrlLocation.value
      ).leafName;
      chatSoundUrlLocation.style.backgroundImage =
        "url(moz-icon://" + chatSoundUrlLocation.label + "?size=16)";
    }
  },

  previewSound() {
    const sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);

    const soundLocation =
      document.getElementById("chatSoundType").value == 1
        ? document.getElementById("chatSoundUrlLocation").value
        : "";

    // This should be in sync with the code in nsStatusBarBiffManager::PlayBiffSound.
    if (!soundLocation.startsWith("file://")) {
      if (Services.appinfo.OS == "Darwin") {
        // OS X
        sound.beep();
      } else {
        sound.playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
      }
    } else {
      sound.play(Services.io.newURI(soundLocation));
    }
  },

  browseForSoundFile() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    // If we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    const localFile = this.convertURLToLocalFile(
      document.getElementById("chatSoundUrlLocation").value
    );
    if (localFile) {
      fp.displayDirectory = localFile.parent;
    }

    // XXX todo, persist the last sound directory and pass it in
    fp.init(
      window,
      document
        .getElementById("bundlePreferences")
        .getString("soundFilePickerTitle"),
      Ci.nsIFilePicker.modeOpen
    );
    fp.appendFilters(Ci.nsIFilePicker.filterAudio);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv != Ci.nsIFilePicker.returnOK) {
        return;
      }

      // convert the nsIFile into a nsIFile url
      Preferences.get("mail.chat.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound() {
    const soundsEnabled = Preferences.get("mail.chat.play_sound").value;
    const soundTypeValue = Preferences.get("mail.chat.play_sound.type").value;
    const soundUrlLocation = Preferences.get("mail.chat.play_sound.url").value;
    const soundDisabled = !soundsEnabled || soundTypeValue != 1;

    document.getElementById("chatSoundType").disabled = !soundsEnabled;
    document.getElementById("chatSoundUrlLocation").disabled = soundDisabled;
    document.getElementById("browseForChatSound").disabled = soundDisabled;
    document.getElementById("playChatSound").disabled =
      !soundsEnabled || (!soundUrlLocation && soundTypeValue != 0);
  },
};

Preferences.get("messenger.status.reportIdle").on(
  "change",
  gChatPane.updateDisabledState
);
Preferences.get("messenger.status.awayWhenIdle").on(
  "change",
  gChatPane.updateMessageDisabledState
);
Preferences.get("mail.chat.play_sound").on("change", gChatPane.updatePlaySound);
Preferences.get("mail.chat.play_sound.type").on(
  "change",
  gChatPane.updatePlaySound
);

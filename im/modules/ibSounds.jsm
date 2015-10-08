/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Sounds"];

Components.utils.import("resource:///modules/hiddenWindow.jsm");
Components.utils.import("resource:///modules/imServices.jsm");
Components.utils.import("resource:///modules/ibInterruptions.jsm");

var Sounds = {
  soundEvents: ["contact-signed-on", "contact-signed-off", "new-text"],
  soundFiles: {
    incoming: "chrome://instantbird-sounds/skin/receive.wav",
    outgoing: "chrome://instantbird-sounds/skin/send.wav",
    login: "chrome://instantbird-sounds/skin/login.wav",
    logout: "chrome://instantbird-sounds/skin/logout.wav",
    alert: "chrome://instantbird-sounds/skin/alert.wav"
  },

  getBoolPref: aPrefName =>
    Services.prefs.getBoolPref("messenger.options.playSounds." + aPrefName),

  play: function sh_play(aEvent, aPref, aSubject, aTopic) {
    if (!this.getBoolPref(aPref) || !this.getBoolPref(aEvent) ||
        !Interruptions.requestInterrupt(aTopic, aSubject, "sound"))
      return;

    new (getHiddenHTMLWindow().Audio)(this.soundFiles[aEvent])
                              .setAttribute("autoplay", "true");
  },

  observe: function(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "contact-signed-on":
      this.play("login", "blist", aObject, aTopic);
      break;

    case "contact-signed-off":
      this.play("logout", "blist", aObject, aTopic);
      break;

    case "new-text":
      if (aObject.outgoing)
        this.play("outgoing", "message", aObject, aTopic);
      else if (aObject.incoming && !aObject.system) {
        if (!aObject.conversation.isChat)
          this.play("incoming", "message", aObject, aTopic);
        else if (aObject.containsNick)
          this.play("alert", "message", aObject, aTopic);
      }
      break;

    default:
      throw "bad notification";
    }
  },

  init: function() {
    for each (let topic in this.soundEvents)
      Services.obs.addObserver(this, topic, false);
  }
};

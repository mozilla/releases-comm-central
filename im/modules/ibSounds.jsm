/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ["Sounds"];

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

  play: function sh_play(aEvent, aPref, aSubject, aTopic) {
    if (!Services.prefs.getBoolPref("messenger.options.playSounds." + aPref) ||
        !Interruptions.requestInterrupt(aTopic, aSubject, "sound"))
      return;

    new getHiddenHTMLWindow().Audio(this.soundFiles[aEvent])
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

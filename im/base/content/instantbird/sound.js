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


var soundHelper = {
  soundFiles: {
    incoming: "chrome://instantbird/skin/sounds/receive.wav",
    outgoing: "chrome://instantbird/skin/sounds/send.wav",
    login: "chrome://instantbird/skin/sounds/login.wav",
    logout: "chrome://instantbird/skin/sounds/logout.wav",
    alert: "chrome://instantbird/skin/sounds/alert.wav"
  },
  _soundUri: { },
  _sound: null,
  play: function sh_play(aEvent) {
    if (!(aEvent in this._soundUri)) {
      if (!(aEvent in this.soundFiles))
        throw "bad sound event";
      this._soundUri[aEvent] = makeURI(this.soundFiles[aEvent]);
    }

    if (!this._sound) {
      this._sound = Components.classes["@mozilla.org/sound;1"]
                              .createInstance(Ci.nsISound);
      this._sound.init();
    }      

    this._sound.play(this._soundUri[aEvent]);
  }
};

const soundEvents = ["buddy-signed-on",
                     "buddy-signed-off",
                     "new-text"];

var soundObserver = {
  observe: function so_observe(aObject, aTopic, aMsg) {
    if (aTopic == "buddy-signed-on") {
      soundHelper.play("login");
      return;
    }

    if (aTopic == "buddy-signed-off") {
      soundHelper.play("logout");
      return;
    }

    if (aTopic == "new-text") {
      if (!(aObject instanceof Ci.purpleIMessage))
	throw "soundObserver.observe called without message";
      if (aObject.incoming)
        soundHelper.play("incoming");
      else
	if (aObject.outgoing)
          soundHelper.play("outgoing");
      return;
    }

    throw "bad notification";
  },
  load: function so_load() {
    addObservers(soundObserver, soundEvents);
    this.addEventListener("unload", soundObserver.unload, false);
  },
  unload: function so_unload() {
    removeObservers(soundObserver, soundEvents);
  }
};

this.addEventListener("load", soundObserver.load, false);

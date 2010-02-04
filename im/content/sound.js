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

const optPrefBranch = "messenger.options.";
const soundsPref = "playSounds";

var soundHelper = {
  soundFiles: {
    incoming: "chrome://instantbird/skin/sounds/receive.wav",
    outgoing: "chrome://instantbird/skin/sounds/send.wav",
    login: "chrome://instantbird/skin/sounds/login.wav",
    logout: "chrome://instantbird/skin/sounds/logout.wav",
    alert: "chrome://instantbird/skin/sounds/alert.wav"
  },
  _soundUri: { },
  _playingEvents: [ ],

  _muted: false,
  get muted() {
    return this._muted;
  },
  set muted(val) {
    this._muted = val;
    if (val)
      this._playingEvents = [ ];
  },

  get _sound() {
    var sound = Components.classes["@mozilla.org/sound;1"]
                          .createInstance(Ci.nsISound);
    sound.init();

    delete this._sound;
    return (this._sound = sound);
  },

  _play: function sh__play() {
    if (this._muted)
      return;

    var uri = soundHelper._soundUri[soundHelper._playingEvents[0]];
    soundHelper._sound.play(uri);
    soundHelper._playingEvents.shift();
    if (soundHelper._playingEvents.length)
      setTimeout(soundHelper._play, 0);
  },

  play: function sh_play(aEvent) {
    if (this._muted)
      return;

    if (!(aEvent in this._soundUri)) {
      if (!(aEvent in this.soundFiles))
        throw "bad sound event";
      this._soundUri[aEvent] = makeURI(this.soundFiles[aEvent]);
    }

    if (this._playingEvents.indexOf(aEvent) == -1)
      if (this._playingEvents.push(aEvent) == 1)
        setTimeout(this._play, 0);
  }
};

const soundEvents = ["buddy-signed-on",
                     "buddy-signed-off",
                     "new-text"];

var soundObserver = {
  observe: function so_observe(aObject, aTopic, aMsg) {
    switch(aTopic) {
    case "buddy-signed-on":
      soundHelper.play("login");
      break;

    case "buddy-signed-off":
      soundHelper.play("logout");
      break;

    case "new-text":
      if (aObject.incoming && !aObject.system) {
        if (!aObject.conversation.isChat || aObject.containsNick)
          soundHelper.play("incoming");
      }
      else
        if (aObject.outgoing)
          soundHelper.play("outgoing");
      break;

    case "nsPref:changed":
      if (aMsg == soundsPref)
        soundHelper.muted = !this._prefBranch.getBoolPref(soundsPref);
      break;

    default:
      throw "bad notification";
    }
  },
  load: function so_load() {
    addObservers(soundObserver, soundEvents);
    soundObserver._prefBranch =
      Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Ci.nsIPrefService)
                .getBranch(optPrefBranch);
    soundObserver._prefBranch.QueryInterface(Ci.nsIPrefBranch2);
    soundObserver._prefBranch.addObserver(soundsPref, soundObserver, false);
    soundHelper.muted = !soundObserver._prefBranch.getBoolPref(soundsPref);

    this.addEventListener("unload", soundObserver.unload, false);
  },
  unload: function so_unload() {
    removeObservers(soundObserver, soundEvents);
    soundObserver._prefBranch.removeObserver(soundsPref, soundObserver);
  }
};

this.addEventListener("load", soundObserver.load, false);


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

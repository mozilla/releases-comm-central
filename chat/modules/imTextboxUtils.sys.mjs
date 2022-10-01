/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var TextboxSize = {
  _textboxAutoResizePrefName: "messenger.conversations.textbox.autoResize",
  get autoResize() {
    delete this.autoResize;
    Services.prefs.addObserver(this._textboxAutoResizePrefName, this);
    return (this.autoResize = Services.prefs.getBoolPref(
      this._textboxAutoResizePrefName
    ));
  },
  observe(aSubject, aTopic, aMsg) {
    if (aTopic == "nsPref:changed" && aMsg == this._textboxAutoResizePrefName) {
      this.autoResize = Services.prefs.getBoolPref(aMsg);
    }
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MessageFormat", "TextboxSize"];

const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");

var MessageFormat = {
  _observedPrefs: [],

  getValues() {
    this.unregisterObservers();
    let langGroup = Services.prefs.getComplexValue(
      "font.language.group",
      Ci.nsIPrefLocalizedString
    ).data;
    let fontGroup = Services.prefs.getCharPref("font.default." + langGroup);
    let fontPref = "font.name." + fontGroup + "." + langGroup;
    let fontSizePref = "font.size.variable." + langGroup;
    this._values = {
      langGroup,
      fontGroup,
      font: Services.prefs.getCharPref(fontPref),
      fontIsDefault: !Services.prefs.prefHasUserValue(fontPref),
      fontSize: Services.prefs.getIntPref(fontSizePref),
      fontSizeIsDefault: !Services.prefs.prefHasUserValue(fontSizePref),
      defaultFontSize: Services.prefs
        .getDefaultBranch(null)
        .getIntPref(fontSizePref),
      foregroundColor: Services.prefs.getCharPref(
        "browser.display.foreground_color"
      ),
      foregroundColorIsDefault: !Services.prefs.prefHasUserValue(
        "browser.display.foreground_color"
      ),
      useSystemColor: Services.prefs.getBoolPref(
        "browser.display.use_system_colors"
      ),
    };

    this._observedPrefs = [
      "font.language.group",
      "font.default." + langGroup,
      "font.name." + fontGroup + "." + langGroup,
      "font.size.variable." + langGroup,
      "browser.display.foreground_color",
      "browser.display.use_system_colors",
    ];
    for (let name of this._observedPrefs) {
      Services.prefs.addObserver(name, this);
    }
  },
  unregisterObservers() {
    for (let name of this._observedPrefs) {
      Services.prefs.removeObserver(name, this);
    }
    this._observedPrefs = [];
  },
  observe(aSubject, aTopic, aMsg) {
    this.getValues();
    for (let textbox of this._textboxes) {
      this.styleTextbox(textbox);
    }
  },
  _getColor() {
    if (this._values.foregroundColorIsDefault || this._values.useSystemColor) {
      return "";
    }
    return this._values.foregroundColor;
  },
  styleTextbox(aTextbox) {
    aTextbox.style.color = this._getColor();
    aTextbox.style.fontSize = this._values.fontSize + "px";
    aTextbox.style.fontFamily = this._values.font;
  },
  getMessageStyle() {
    let result = {};

    let color = this._getColor();
    if (color) {
      result.color = color;
    }

    if (!this._values.fontSizeIsDefault) {
      result.fontSize = this._values.fontSize;
      result.defaultFontSize = this._values.defaultFontSize;
    }

    if (!this._values.fontIsDefault) {
      result.fontFamily = this._values.font;
    }

    return result;
  },
  _textboxes: [],
  registerTextbox(aTextbox) {
    if (!this._textboxes.includes(aTextbox)) {
      this._textboxes.push(aTextbox);
    }

    if (this._textboxes.length == 1) {
      this.getValues();
    }

    this.styleTextbox(aTextbox);
  },
  unregisterTextbox(aTextbox) {
    let index = this._textboxes.indexOf(aTextbox);
    if (index != -1) {
      this._textboxes.splice(index, 1);
    }

    if (!this._textboxes.length) {
      this.unregisterObservers();
    }
  },
};

var TextboxSize = {
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

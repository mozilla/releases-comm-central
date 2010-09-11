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
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
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

var EXPORTED_SYMBOLS = ["MessageFormat", "TextboxSize", "TextboxSpellChecker"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

XPCOMUtils.defineLazyGetter(this, "prefs", function() {
  return Cc["@mozilla.org/preferences-service;1"]
           .getService(Ci.nsIPrefService)
           .QueryInterface(Ci.nsIPrefBranch2);
});

let MessageFormat = {
  _observedPrefs: [],

  getValues: function mf_getValues() {
    this.unregisterObservers();
    let langGroup =
      prefs.getComplexValue("font.language.group",
                            Components.interfaces.nsIPrefLocalizedString).data;
    let fontGroup = prefs.getCharPref("font.default." + langGroup);
    let fontPref = "font.name." + fontGroup + "." + langGroup;
    let fontSizePref = "font.size.variable." + langGroup;
    this._values = {
      langGroup: langGroup,
      fontGroup: fontGroup,
      font: prefs.getCharPref(fontPref),
      fontIsDefault: !prefs.prefHasUserValue(fontPref),
      fontSize: prefs.getIntPref(fontSizePref),
      fontSizeIsDefault: !prefs.prefHasUserValue(fontSizePref),
      defaultFontSize: prefs.getDefaultBranch(null).getIntPref(fontSizePref),
      foregroundColor: prefs.getCharPref("browser.display.foreground_color"),
      foregroundColorIsDefault:
        !prefs.prefHasUserValue("browser.display.foreground_color"),
      useSystemColor: prefs.getBoolPref("browser.display.use_system_colors")
    };

    this._observedPrefs = [
      "font.language.group",
      "font.default." + langGroup,
      "font.name." + fontGroup + "." + langGroup,
      "font.size.variable." + langGroup,
      "browser.display.foreground_color",
      "browser.display.use_system_colors"
    ];
    for each (let name in this._observedPrefs)
      prefs.addObserver(name, this, false);
  },
  unregisterObservers: function mf_unregisterObservers() {
    for each (let name in this._observedPrefs)
      prefs.removeObserver(name, this);
    this._observedPrefs = [];
  },
  observe: function(aSubject, aTopic, aMsg) {
    this.getValues();
    for each (let textbox in this._textboxes)
      this.styleTextbox(textbox);
  },
  _getColor: function mf__getColor() {
    if (this._values.foregroundColorIsDefault || this._values.useSystemColor)
      return "";
    return this._values.foregroundColor;
  },
  styleTextbox: function mf_styleTextbox(aTextbox) {
    aTextbox.style.color = this._getColor();
    aTextbox.style.fontSize = this._values.fontSize + "px";
    aTextbox.style.fontFamily = this._values.font;
  },
  getMessageStyle: function mf_getMessageStyle() {
    let result = {};

    let color = this._getColor();
    if (color)
      result.color = color;

    if (!this._values.fontSizeIsDefault) {
      result.fontSize = this._values.fontSize;
      result.defaultFontSize = this._values.defaultFontSize;
    }

    if (!this._values.fontIsDefault)
      result.fontFamily = this._values.font;

    return result;
  },
  _textboxes: [],
  registerTextbox: function mf_registerTextbox(aTextbox) {
    if (this._textboxes.indexOf(aTextbox) == -1)
      this._textboxes.push(aTextbox);

    if (this._textboxes.length == 1)
      this.getValues();

    this.styleTextbox(aTextbox);
  },
  unregisterTextbox: function(aTextbox) {
    let index = this._textboxes.indexOf(aTextbox);
    if (index != -1)
      this._textboxes.splice(index, 1);

    if (!this._textboxes.length)
      this.unregisterObservers();
  }
};

let TextboxSize = {
  _textboxAutoResizePrefName: "messenger.conversations.textbox.autoResize",
  get autoResize() {
    delete this.autoResize;
    prefs.addObserver(this._textboxAutoResizePrefName, this, false);
    return this.autoResize =
      prefs.getBoolPref(this._textboxAutoResizePrefName);
  },
  observe: function(aSubject, aTopic, aMsg) {
    if (aTopic == "nsPref:changed" && aMsg == this._textboxAutoResizePrefName)
      this.autoResize = prefs.getBoolPref(aMsg);
  }
};

let TextboxSpellChecker = {
  _spellCheckPrefName: "layout.spellcheckDefault",
  _enabled: false,
 getValue: function tsc_getValue() {
    this._enabled = !!prefs.getIntPref(this._spellCheckPrefName);
  },
  applyValue: function tsc_applyValue(aTextbox) {
    if (this._enabled)
      aTextbox.setAttribute("spellcheck", "true");
    else
      aTextbox.removeAttribute("spellcheck");
  },

  _textboxes: [],
  registerTextbox: function tsc_registerTextbox(aTextbox) {
    if (this._textboxes.indexOf(aTextbox) == -1)
      this._textboxes.push(aTextbox);

    if (this._textboxes.length == 1) {
      prefs.addObserver(this._spellCheckPrefName, this, false);
      this.getValue();
    }

    this.applyValue(aTextbox);
  },
  unregisterTextbox: function tsc_unregisterTextbox(aTextbox) {
    let index = this._textboxes.indexOf(aTextbox);
    if (index != -1)
      this._textboxes.splice(index, 1);

    if (!this._textboxes.length)
      prefs.removeObserver(this._spellCheckPrefName, this);
  },
  observe: function tsc_observe(aSubject, aTopic, aMsg) {
    this.getValue();
    for each (let textbox in this._textboxes)
      this.applyValue(textbox);
  }
};

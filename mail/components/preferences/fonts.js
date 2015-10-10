/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

var kDefaultFontType          = "font.default.%LANG%";
var kFontNameFmtSerif         = "font.name.serif.%LANG%";
var kFontNameFmtSansSerif     = "font.name.sans-serif.%LANG%";
var kFontNameFmtMonospace     = "font.name.monospace.%LANG%";
var kFontNameListFmtSerif     = "font.name-list.serif.%LANG%";
var kFontNameListFmtSansSerif = "font.name-list.sans-serif.%LANG%";
var kFontNameListFmtMonospace = "font.name-list.monospace.%LANG%";
var kFontSizeFmtVariable      = "font.size.variable.%LANG%";
var kFontSizeFmtFixed         = "font.size.fixed.%LANG%";
var kFontMinSizeFmt           = "font.minimum-size.%LANG%";

var gFontsDialog = {
  _selectLanguageGroup: function (aLanguageGroup)
  {
    var prefs = [{ format: kDefaultFontType,          type: "string",   element: "defaultFontType", fonttype: null},
                 { format: kFontNameFmtSerif,         type: "fontname", element: "serif",      fonttype: "serif"       },
                 { format: kFontNameFmtSansSerif,     type: "fontname", element: "sans-serif", fonttype: "sans-serif"  },
                 { format: kFontNameFmtMonospace,     type: "fontname", element: "monospace",  fonttype: "monospace"   },
                 { format: kFontNameListFmtSerif,     type: "unichar",  element: null,         fonttype: "serif"       },
                 { format: kFontNameListFmtSansSerif, type: "unichar",  element: null,         fonttype: "sans-serif"  },
                 { format: kFontNameListFmtMonospace, type: "unichar",  element: null,         fonttype: "monospace"   },
                 { format: kFontSizeFmtVariable,      type: "int",      element: "sizeVar",    fonttype: null          },
                 { format: kFontSizeFmtFixed,         type: "int",      element: "sizeMono",   fonttype: null          },
                 { format: kFontMinSizeFmt,           type: "int",      element: "minSize",    fonttype: null          }];
    var preferences = document.getElementById("fontPreferences");
    for (var i = 0; i < prefs.length; ++i) {
      var preference = document.getElementById(prefs[i].format.replace(/%LANG%/, aLanguageGroup));
      if (!preference) {
        preference = document.createElement("preference");
        var name = prefs[i].format.replace(/%LANG%/, aLanguageGroup);
        preference.id = name;
        preference.setAttribute("name", name);
        preference.setAttribute("type", prefs[i].type);
        preferences.appendChild(preference);
      }

      if (!prefs[i].element)
        continue;

      var element = document.getElementById(prefs[i].element);
      if (element) {
        element.setAttribute("preference", preference.id);

        if (prefs[i].fonttype)
          FontBuilder.buildFontList(aLanguageGroup, prefs[i].fonttype, element);

        preference.setElementValue(element);
      }
    }
  },

  readFontLanguageGroup: function ()
  {
    var languagePref = document.getElementById("font.language.group");
    this._selectLanguageGroup(languagePref.value);
    return undefined;
  },

  readFontSelection: function (aElement)
  {
    // Determine the appropriate value to select, for the following cases:
    // - there is no setting
    // - the font selected by the user is no longer present (e.g. deleted from
    //   fonts folder)
    let preference = document.getElementById(aElement.getAttribute("preference"));
    let fontItem;
    if (preference.value) {
      fontItem = aElement.querySelector('[value="' + preference.value + '"]');

      // There is a setting that actually is in the list. Respect it.
      if (fontItem)
        return undefined;
    }

    let defaultValue = aElement.firstChild.firstChild.getAttribute("value");
    let languagePref = document.getElementById("font.language.group");
    let prefId = "font.name-list." + aElement.id + "." + languagePref.value;
    preference = document.getElementById(prefId);
    if (!preference || !preference.value)
      return defaultValue;

    let fontNames = preference.value.split(",");

    for (let i = 0; i < fontNames.length; ++i) {
      let fontName = fontNames[i].trim();
      fontItem = aElement.querySelector('[value="' + fontName + '"]');
      if (fontItem)
        break;
    }
    if (fontItem)
      return fontItem.getAttribute("value");
    return defaultValue;
  },

  readUseDocumentFonts: function ()
  {
    var preference = document.getElementById("browser.display.use_document_fonts");
    return preference.value == 1;
  },

  writeUseDocumentFonts: function ()
  {
    var useDocumentFonts = document.getElementById("useDocumentFonts");
    return useDocumentFonts.checked;
  },

  readFixedWidthForPlainText: function ()
  {
    var preference = document.getElementById("mail.fixed_width_messages");
    return preference.value == 1;
  },

  writeFixedWidthForPlainText: function ()
  {
    var mailFixedWidthMessages = document.getElementById("mailFixedWidthMessages");
    return mailFixedWidthMessages.checked;
  },

  /**
   * Both mailnews.send_default_charset and mailnews.view_default_charset
   * are nsIPrefLocalizedString. Its default value is different depending
   * on the user locale (see bug 48842).
   */
  ondialogaccept: function()
  {
    var Ci = Components.interfaces;

    var sendCharsetStr = Services.prefs.getComplexValue(
      "mailnews.send_default_charset", Ci.nsIPrefLocalizedString).data;

    var viewCharsetStr = Services.prefs.getComplexValue(
      "mailnews.view_default_charset", Ci.nsIPrefLocalizedString).data;

    var defaultPrefs = Services.prefs.getDefaultBranch("mailnews.");

    // Here we compare preference's stored value with default one and,
    // if needed, show it as "default" on Config Editor instead of "user set".
    if (sendCharsetStr === defaultPrefs.getComplexValue(
          "send_default_charset", Ci.nsIPrefLocalizedString).data)
      Services.prefs.clearUserPref("mailnews.send_default_charset");

    if (viewCharsetStr === defaultPrefs.getComplexValue(
          "view_default_charset", Ci.nsIPrefLocalizedString).data)
      Services.prefs.clearUserPref("mailnews.view_default_charset");

    return true;
  }
};

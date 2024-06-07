/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var gFontsDialog = {
  _disabled: false,
  _enumerator: null,
  get enumerator() {
    if (!this._enumerator) {
      this._enumerator = Cc["@mozilla.org/gfx/fontenumerator;1"]
                           .createInstance(Ci.nsIFontEnumerator);
    }
    return this._enumerator;
  },

  _allFonts: null,
  async buildFontList(aLanguage, aFontType, aMenuList) {
    // Reset the list
    while (aMenuList.hasChildNodes()) {
      aMenuList.firstChild.remove();
    }

    let defaultFont = null;
    // Load Font Lists
    let fonts = await this.enumerator.EnumerateFontsAsync(aLanguage,
                                                          aFontType);
    if (fonts.length > 0) {
      defaultFont = this.enumerator.getDefaultFont(aLanguage, aFontType);
    } else {
      fonts = await this.enumerator.EnumerateFontsAsync(aLanguage, "");
      if (fonts.length > 0)
        defaultFont = this.enumerator.getDefaultFont(aLanguage, "");
    }

    if (!this._allFonts) {
      this._allFonts = await this.enumerator.EnumerateAllFontsAsync({});
    }

    // Build the UI for the Default Font and Fonts for this CSS type.
    const popup = document.createElement("menupopup");
    let separator;
    let menuitem;
    if (fonts.length > 0) {
      const bundlePrefs = document.getElementById("bundle_prefutilities");
      let defaultLabel = defaultFont ?
        bundlePrefs.getFormattedString("labelDefaultFont2", [defaultFont]) :
        bundlePrefs.getString("labelDefaultFontUnnamed");
      menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", defaultLabel);
      menuitem.setAttribute("value", ""); // Default Font has a blank value
      popup.appendChild(menuitem);

      separator = document.createElement("menuseparator");
      popup.appendChild(separator);

      for (let font of fonts) {
        menuitem = document.createElement("menuitem");
        menuitem.setAttribute("value", font);
        menuitem.setAttribute("label", font);
        popup.appendChild(menuitem);
      }
    }

    // Build the UI for the remaining fonts.
    if (this._allFonts.length > fonts.length) {
      // Both lists are sorted, and the Fonts-By-Type list is a subset of the
      // All-Fonts list, so walk both lists side-by-side, skipping values we've
      // already created menu items for.

      if (fonts.length > 0) {
        separator = document.createElement("menuseparator");
        popup.appendChild(separator);
      }

      for (let font of this._allFonts) {
        if (fonts.lastIndexOf(font, 0) == 0) {
          fonts.shift(); //Remove matched font from array
        } else {
          menuitem = document.createElement("menuitem");
          menuitem.setAttribute("value", font);
          menuitem.setAttribute("label", font);
          popup.appendChild(menuitem);
        }
      }
    }
    aMenuList.appendChild(popup);
  },

  readFontSelection(aElement) {
    // Determine the appropriate value to select, for the following cases:
    // - there is no setting
    // - the font selected by the user is no longer present (e.g. deleted from
    //   fonts folder)
    const preference = document.getElementById(aElement.getAttribute("preference"));
    if (preference.value) {
      let fontItems = aElement.getElementsByAttribute("value", preference.value);

      // There is a setting that actually is in the list. Respect it.
      if (fontItems.length) {
        return undefined;
      }
    }

    // Otherwise, use "default" font of current system which is computed
    // with "font.name-list.*".  If "font.name.*" is empty string, it means
    // "default".  So, return empty string in this case.
    return "";
  },

  _selectLanguageGroupPromise: Promise.resolve(),

  _selectLanguageGroup(aLanguageGroup) {
    this._selectLanguageGroupPromise = (async () => {
      // Avoid overlapping language group selections by awaiting the resolution
      // of the previous one. We do this because this function is re-entrant,
      // as inserting <preference> elements into the DOM sometimes triggers a
      // call back into this function. And since this function is also
      // asynchronous, that call can enter this function before the previous
      // run has completed, which would corrupt the font menulists. Awaiting
      // the previous call's resolution avoids that fate.
      await this._selectLanguageGroupPromise;

      var prefs = [{format: "default",       type: "string",   element: "defaultFontType", fonttype: ""          },
                   {format: "name.",         type: "fontname", element: "serif",           fonttype: "serif"     },
                   {format: "name.",         type: "fontname", element: "sans-serif",      fonttype: "sans-serif"},
                   {format: "name.",         type: "fontname", element: "monospace",       fonttype: "monospace" },
                   {format: "name.",         type: "fontname", element: "cursive",         fonttype: "cursive"   },
                   {format: "name.",         type: "fontname", element: "fantasy",         fonttype: "fantasy"   },
                   {format: "name-list.",    type: "unichar",  element: null,              fonttype: "serif"     },
                   {format: "name-list.",    type: "unichar",  element: null,              fonttype: "sans-serif"},
                   {format: "name-list.",    type: "unichar",  element: null,              fonttype: "monospace" },
                   {format: "name-list.",    type: "unichar",  element: null,              fonttype: "cursive"   },
                   {format: "name-list.",    type: "unichar",  element: null,              fonttype: "fantasy"   },
                   {format: "size.variable", type: "int",      element: "sizeVar",         fonttype: ""          },
                   {format: "size.fixed",    type: "int",      element: "sizeMono",        fonttype: ""          },
                   {format: "minimum-size",  type: "int",      element: "minSize",         fonttype: ""          }];
      var preferences = document.getElementById("fonts_preferences");
      for (var i = 0; i < prefs.length; ++i) {
        var name = "font."+ prefs[i].format + prefs[i].fonttype + "." + aLanguageGroup;
        var preference = document.getElementById(name);
        if (!preference) {
          preference = document.createElement("preference");
          preference.id = name;
          preference.setAttribute("name", name);
          preference.setAttribute("type", prefs[i].type);
          preferences.appendChild(preference);
        }

        if (!prefs[i].element) {
          continue;
        }

        var element = document.getElementById(prefs[i].element);
        if (element) {
          element.setAttribute("preference", preference.id);

          if (prefs[i].fonttype) {
            // Set an empty label so it does not jump when items are added.
            element.setAttribute("label", "");
            await this.buildFontList(aLanguageGroup, prefs[i].fonttype,
                                     element);
          }

          // Unless the panel is locked, make sure these elements are not
          // disabled just in case they were in the last language group.
          element.disabled = this._disabled;
          preference.setElementValue(element);
        }
      }
    })().catch(Cu.reportError);
  },

  readFontLanguageGroup() {
    this._disabled = document.getElementById("browser.display.languageList")
                             .locked;
    var languagePref = document.getElementById("font.language.group");
    if (this._disabled) {
      languagePref.disabled = true;
    }
    this._selectLanguageGroup(languagePref.value);
    return undefined;
  },

  readFontPref(aElement, aDefaultValue) {
    // Check to see if preference value exists,
    // if not return given default value.
    var preference = document.getElementById(aElement.getAttribute("preference"));
    return preference.value || aDefaultValue;
  },

  readUseDocumentFonts() {
    var preference =
      document.getElementById("browser.display.use_document_fonts");
    return preference.value == 1;
  },

  writeUseDocumentFonts(aUseDocumentFonts) {
    return aUseDocumentFonts.checked ? 1 : 0;
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Helpers for reading and writing calendar categories
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.category namespace.

const EXPORTED_SYMBOLS = ["calcategory"]; /* exported calcategory */

var calcategory = {
  /**
   * Sets up the default categories from the localized string
   *
   * @return      The default set of categories as a comma separated string.
   */
  setupDefaultCategories() {
    let defaultBranch = Services.prefs.getDefaultBranch("");

    // First, set up the category names
    let categories = cal.l10n.getString("categories", "categories2");
    defaultBranch.setStringPref("calendar.categories.names", categories);

    // Now, initialize the category default colors
    let categoryArray = calcategory.stringToArray(categories);
    for (let category of categoryArray) {
      let prefName = cal.view.formatStringForCSSRule(category);
      defaultBranch.setStringPref(
        "calendar.category.color." + prefName,
        cal.view.hashColor(category)
      );
    }

    // Return the list of categories for further processing
    return categories;
  },

  /**
   * Get array of category names from preferences or locale default,
   * unescaping any commas in each category name.
   *
   * @return                      array of category names
   */
  fromPrefs() {
    let categories = Services.prefs.getStringPref("calendar.categories.names", null);

    // If no categories are configured load a default set from properties file
    if (!categories) {
      categories = calcategory.setupDefaultCategories();
    }
    return calcategory.stringToArray(categories);
  },

  /**
   * Convert categories string to list of category names.
   *
   * Stored categories may include escaped commas within a name. Split
   * categories string at commas, but not at escaped commas (\,). Afterward,
   * replace escaped commas (\,) with commas (,) in each name.
   *
   * @param aCategoriesPrefValue  string from "calendar.categories.names" pref,
   *                                which may contain escaped commas (\,) in names.
   * @return                      list of category names
   */
  stringToArray(aCategories) {
    if (!aCategories) {
      return [];
    }
    /* eslint-disable no-control-regex */
    // \u001A is the unicode "SUBSTITUTE" character
    let categories = aCategories
      .replace(/\\,/g, "\u001A")
      .split(",")
      .map(name => name.replace(/\u001A/g, ","));
    /* eslint-enable no-control-regex */
    if (categories.length == 1 && categories[0] == "") {
      // Split will return an array with an empty element when splitting an
      // empty string, correct this.
      categories.pop();
    }
    return categories;
  },

  /**
   * Convert array of category names to string.
   *
   * Category names may contain commas (,). Escape commas (\,) in each, then
   * join them in comma separated string for storage.
   *
   * @param aSortedCategoriesArray    sorted array of category names, may
   *                                    contain unescaped commas, which will
   *                                    be escaped in combined string.
   */
  arrayToString(aSortedCategoriesArray) {
    return aSortedCategoriesArray.map(cat => cat.replace(/,/g, "\\,")).join(",");
  },
};

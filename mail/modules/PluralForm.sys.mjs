/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module provides the PluralForm object which contains a method to figure
 * out which plural form of a word to use for a given number based on the
 * current localization.
 */

/* eslint-disable jsdoc/check-param-names, no-nested-ternary */

export const PluralForm = {
  init() {
    delete this.numForms;
    delete this.get;

    const [numForms, pluralFunc] = this.getPluralRule();
    this.numForms = () => numForms;
    this.get = (aNum, aWords) => {
      // Figure out which index to use for the semi-colon separated words
      const index = pluralFunc(aNum ? Number(aNum) : 0);
      const words = aWords ? aWords.split(/;/) : [""];

      // Explicitly check bounds to avoid strict warnings
      let ret = index < words.length ? words[index] : undefined;

      // Check for array out of bounds or empty strings
      if (ret == undefined || ret == "") {
        console.warn(
          `plural-form.js: Index #${index} of '${aWords}' for value ${aNum} is invalid;\n`
        );

        // Default to the first entry (which might be empty, but not undefined)
        ret = words[0];
      }

      return ret;
    };
  },

  /**
   * Get the correct plural form of a word based on the number. This function
   * gets replaced at runtime by `init`.
   *
   * @param {number} aNum - The number to decide which plural form to use.
   * @param {string} aWords - A semi-colon (;) separated string of words to
   *   pick the plural form from.
   * @returns {string} The appropriate plural form of the word.
   */
  get get() {
    this.init();
    return this.get;
  },

  /**
   * Get the number of forms for the current plural rule. This function gets
   * replaced at runtime by `init`.
   *
   * @returns {number} The number of forms.
   */
  get numForms() {
    this.init();
    return this.numForms;
  },

  /**
   * Selects the number of plural categories and the function for selecting
   * between them.
   *
   * The default is to use the same plural rules as English, which has "one"
   * and "other" categories. This is only used for number of legacy messages
   * that have a custom format; Fluent plurals in general rely on Unicode
   * Common Locale Data Repository data.
   *
   * @returns {Array<number, Function>} The available plural function that
   *   gives the appropriate index based on the plural rule number specified.
   *   The first element is the number of plural forms and the second is the
   *   function to figure out the index.
   */
  getPluralRule() {
    let appLocale = Services.locale.appLocalesAsLangTags[0];

    // See https://searchfox.org/firefox-main/rev/f6385e6644d5d4343d33b692810275c434122199/intl/docs/locale.rst#463-471
    // Swap ja-JP-mac (legacy locale in gecko, but invalid) with the valid ja-JP-macos
    if (appLocale == "ja-JP-mac") {
      appLocale = "ja-JP-macos";
    }

    const locale = new Intl.Locale(appLocale);
    switch (locale.language) {
      case "bo":
      case "id":
      case "ja":
      case "km":
      case "ko":
      case "lo":
      case "meh":
      case "ms":
      case "my":
      case "th":
      case "vi":
      case "wo":
      case "zh":
        return [1, _n => 0];
      case "bn":
      case "fa":
      case "fr":
      case "gu":
      case "hi":
      case "oc":
      case "pa":
        return [2, n => (n > 1 ? 1 : 0)];
      case "ltg":
      case "lv":
        return [
          3,
          n => (n % 10 == 1 && n % 100 != 11 ? 1 : n % 10 == 0 ? 0 : 2),
        ];
      case "gd":
        return [
          4,
          n =>
            n == 1 || n == 11
              ? 0
              : n == 2 || n == 12
                ? 1
                : n > 0 && n < 20
                  ? 2
                  : 3,
        ];
      case "ro":
        return [
          3,
          n => (n == 1 ? 0 : n == 0 || (n % 100 > 0 && n % 100 < 20) ? 1 : 2),
        ];
      case "lt":
        return [
          3,
          n =>
            n % 10 == 1 && n % 100 != 11
              ? 0
              : n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20)
                ? 2
                : 1,
        ];
      case "be":
      case "ru":
      case "uk":
        return [
          3,
          n =>
            n % 10 == 1 && n % 100 != 11
              ? 0
              : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
                ? 1
                : 2,
        ];
      case "cs":
      case "sk":
        return [3, n => (n == 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2)];
      case "pl":
      case "szl":
        return [
          3,
          n =>
            n == 1
              ? 0
              : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
                ? 1
                : 2,
        ];
      case "dsb":
      case "hsb":
      case "sl":
        return [
          4,
          n =>
            n % 100 == 1
              ? 0
              : n % 100 == 2
                ? 1
                : n % 100 == 3 || n % 100 == 4
                  ? 2
                  : 3,
        ];
      case "ga":
        return [
          5,
          n =>
            n == 1
              ? 0
              : n == 2
                ? 1
                : n >= 3 && n <= 6
                  ? 2
                  : n >= 7 && n <= 10
                    ? 3
                    : 4,
        ];
      case "ar":
        return [
          6,
          n =>
            n == 0
              ? 5
              : n == 1
                ? 0
                : n == 2
                  ? 1
                  : n % 100 >= 3 && n % 100 <= 10
                    ? 2
                    : n % 100 >= 11 && n % 100 <= 99
                      ? 3
                      : 4,
        ];
      case "is":
      case "mk":
        return [
          4,
          n =>
            n == 1
              ? 0
              : n == 0 || (n % 100 > 0 && n % 100 <= 10)
                ? 1
                : n % 100 > 10 && n % 100 < 20
                  ? 2
                  : 3,
        ];
      case "br":
        return [
          5,
          n =>
            n % 10 == 1 && n % 100 != 11 && n % 100 != 71 && n % 100 != 91
              ? 0
              : n % 10 == 2 && n % 100 != 12 && n % 100 != 72 && n % 100 != 92
                ? 1
                : (n % 10 == 3 || n % 10 == 4 || n % 10 == 9) &&
                    n % 100 != 13 &&
                    n % 100 != 14 &&
                    n % 100 != 19 &&
                    n % 100 != 73 &&
                    n % 100 != 74 &&
                    n % 100 != 79 &&
                    n % 100 != 93 &&
                    n % 100 != 94 &&
                    n % 100 != 99
                  ? 2
                  : n % 1000000 == 0 && n != 0
                    ? 3
                    : 4,
        ];
      case "cy":
        return [
          6,
          n =>
            n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : n == 3 ? 3 : n == 6 ? 4 : 5,
        ];
      case "bs":
      case "hr":
      case "sr":
        return [
          3,
          n =>
            n % 10 == 1 && n % 100 != 11
              ? 0
              : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
                ? 1
                : 2,
        ];
      default:
        return [2, n => (n != 1 ? 1 : 0)];
    }
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module provides the PluralForm object which contains a method to figure
 * out which plural form of a word to use for a given number based on the
 * current localization. There is also a makeGetter method that creates a get
 * function for the desired plural rule. This is useful for extensions that
 * specify their own plural rule instead of relying on the browser default.
 * (I.e., the extension hasn't been localized to the browser's locale.)
 *
 * See: http://developer.mozilla.org/en/docs/Localization_and_Plurals
 *
 * NOTE: any change to these plural forms need to be reflected in
 * compare-locales:
 * https://hg.mozilla.org/l10n/compare-locales/file/default/compare_locales/plurals.py
 *
 * List of methods:
 *
 * string pluralForm
 * get(int aNum, string aWords)
 *
 * int numForms
 * numForms()
 *
 * [string pluralForm get(int aNum, string aWords), int numForms numForms()]
 * makeGetter(int aRuleNum)
 * Note: Basically, makeGetter returns 2 functions that do "get" and "numForm"
 */

const LOCALE_PLURAL_NUMBER = {
  ach: 1,
  af: 1,
  an: 1,
  ar: 12,
  ast: 1,
  az: 1,
  be: 7,
  bg: 1,
  bn: 2,
  bo: 0,
  br: 16,
  brx: 1,
  bs: 19,
  ca: 1,
  "ca-valencia": 1,
  cak: 1,
  ckb: 1,
  cs: 8,
  cy: 18,
  da: 1,
  de: 1,
  dsb: 10,
  el: 1,
  "en-CA": 1,
  "en-GB": 1,
  "en-US": 1,
  eo: 1,
  "es-AR": 1,
  "es-CL": 1,
  "es-ES": 1,
  "es-MX": 1,
  et: 1,
  eu: 1,
  fa: 2,
  ff: 1,
  fi: 1,
  fr: 2,
  fur: 1,
  "fy-NL": 1,
  "ga-IE": 11,
  gd: 4,
  gl: 1,
  gn: 1,
  "gu-IN": 2,
  he: 1,
  "hi-IN": 2,
  hr: 19,
  hsb: 10,
  hu: 1,
  "hy-AM": 1,
  hye: 1,
  ia: 1,
  id: 0,
  is: 15,
  it: 1,
  ja: 0,
  "ja-JP-mac": 0,
  ka: 1,
  kab: 1,
  kk: 1,
  km: 0,
  kn: 1,
  ko: 0,
  lij: 1,
  lo: 0,
  lt: 6,
  ltg: 3,
  lv: 3,
  meh: 0,
  mk: 15,
  mr: 1,
  ms: 0,
  my: 0,
  "nb-NO": 1,
  "ne-NP": 1,
  nl: 1,
  "nn-NO": 1,
  oc: 2,
  "pa-IN": 2,
  pl: 9,
  "pt-BR": 1,
  "pt-PT": 1,
  rm: 1,
  ro: 5,
  ru: 7,
  sat: 1,
  sc: 1,
  scn: 1,
  sco: 1,
  si: 1,
  sk: 8,
  skr: 1,
  sl: 10,
  son: 1,
  sq: 1,
  sr: 19,
  "sv-SE": 1,
  szl: 9,
  ta: 1,
  te: 1,
  tg: 1,
  th: 0,
  tl: 1,
  tr: 1,
  trs: 1,
  uk: 7,
  ur: 1,
  uz: 1,
  vi: 0,
  wo: 0,
  xh: 1,
  "zh-CN": 0,
  "zh-TW": 0,
};

// These are the available plural functions that give the appropriate index
// based on the plural rule number specified. The first element is the number
// of plural forms and the second is the function to figure out the index.
/* eslint-disable no-nested-ternary */
var gFunctions = [
  // 0: Chinese
  [1, n => 0],
  // 1: English
  [2, n => (n != 1 ? 1 : 0)],
  // 2: French
  [2, n => (n > 1 ? 1 : 0)],
  // 3: Latvian
  [3, n => (n % 10 == 1 && n % 100 != 11 ? 1 : n % 10 == 0 ? 0 : 2)],
  // 4: Scottish Gaelic
  [
    4,
    n =>
      n == 1 || n == 11 ? 0 : n == 2 || n == 12 ? 1 : n > 0 && n < 20 ? 2 : 3,
  ],
  // 5: Romanian
  [3, n => (n == 1 ? 0 : n == 0 || (n % 100 > 0 && n % 100 < 20) ? 1 : 2)],
  // 6: Lithuanian
  [
    3,
    n =>
      n % 10 == 1 && n % 100 != 11
        ? 0
        : n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20)
        ? 2
        : 1,
  ],
  // 7: Russian
  [
    3,
    n =>
      n % 10 == 1 && n % 100 != 11
        ? 0
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
        ? 1
        : 2,
  ],
  // 8: Slovak
  [3, n => (n == 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2)],
  // 9: Polish
  [
    3,
    n =>
      n == 1
        ? 0
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
        ? 1
        : 2,
  ],
  // 10: Slovenian
  [
    4,
    n =>
      n % 100 == 1
        ? 0
        : n % 100 == 2
        ? 1
        : n % 100 == 3 || n % 100 == 4
        ? 2
        : 3,
  ],
  // 11: Irish Gaeilge
  [
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
  ],
  // 12: Arabic
  [
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
  ],
  // 13: Maltese
  [
    4,
    n =>
      n == 1
        ? 0
        : n == 0 || (n % 100 > 0 && n % 100 <= 10)
        ? 1
        : n % 100 > 10 && n % 100 < 20
        ? 2
        : 3,
  ],
  // 14: Unused
  [3, n => (n % 10 == 1 ? 0 : n % 10 == 2 ? 1 : 2)],
  // 15: Icelandic, Macedonian
  [2, n => (n % 10 == 1 && n % 100 != 11 ? 0 : 1)],
  // 16: Breton
  [
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
  ],
  // 17: Shuar
  [2, n => (n != 0 ? 1 : 0)],
  // 18: Welsh
  [
    6,
    n => (n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : n == 3 ? 3 : n == 6 ? 4 : 5),
  ],
  // 19: Slavic languages (bs, hr, sr). Same as rule 7, but resulting in different CLDR categories
  [
    3,
    n =>
      n % 10 == 1 && n % 100 != 11
        ? 0
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
        ? 1
        : 2,
  ],
];

/* eslint-enable no-nested-ternary */

export var PluralForm = {
  /**
   * Get the correct plural form of a word based on the number
   *
   * @param aNum
   *        The number to decide which plural form to use
   * @param aWords
   *        A semi-colon (;) separated string of words to pick the plural form
   * @return The appropriate plural form of the word
   */
  get get() {
    // This method will lazily load to avoid perf when it is first needed and
    // creates getPluralForm function. The function it creates is based on the
    // value of pluralRule specified in the intl stringbundle.
    // See: http://developer.mozilla.org/en/docs/Localization_and_Plurals

    // Delete the getters to be overwritten
    delete PluralForm.numForms;
    delete PluralForm.get;

    // Make the plural form get function and set it as the default get
    [PluralForm.get, PluralForm.numForms] = PluralForm.makeGetter(
      PluralForm.ruleNum
    );
    return PluralForm.get;
  },

  /**
   * Create a pair of plural form functions for the given plural rule number.
   *
   * @param aRuleNum
   *        The plural rule number to create functions
   * @return A pair: [function that gets the right plural form,
   *                  function that returns the number of plural forms]
   */
  makeGetter(aRuleNum) {
    // Default to "all plural" if the value is out of bounds or invalid
    if (aRuleNum < 0 || aRuleNum >= gFunctions.length || isNaN(aRuleNum)) {
      log(["Invalid rule number: ", aRuleNum, " -- defaulting to 0"]);
      aRuleNum = 0;
    }

    // Get the desired pluralRule function
    const [numForms, pluralFunc] = gFunctions[aRuleNum];

    // Return functions that give 1) the number of forms and 2) gets the right
    // plural form
    return [
      function (aNum, aWords) {
        // Figure out which index to use for the semi-colon separated words
        const index = pluralFunc(aNum ? Number(aNum) : 0);
        const words = aWords ? aWords.split(/;/) : [""];

        // Explicitly check bounds to avoid strict warnings
        let ret = index < words.length ? words[index] : undefined;

        // Check for array out of bounds or empty strings
        if (ret == undefined || ret == "") {
          // Report the caller to help figure out who is causing badness
          const caller = Components.stack.caller
            ? Components.stack.caller.name
            : "top";

          // Display a message in the error console
          log([
            "Index #",
            index,
            " of '",
            aWords,
            "' for value ",
            aNum,
            " is invalid -- plural rule #",
            aRuleNum,
            "; called by ",
            caller,
          ]);

          // Default to the first entry (which might be empty, but not undefined)
          ret = words[0];
        }

        return ret;
      },
      () => numForms,
    ];
  },

  /**
   * Get the number of forms for the current plural rule
   *
   * @return The number of forms
   */
  get numForms() {
    // We lazily load numForms, so trigger the init logic with get()
    PluralForm.get();
    return PluralForm.numForms;
  },

  /**
   * Get the plural rule number for the current app locale
   *
   * @return The plural rule number
   */
  get ruleNum() {
    return LOCALE_PLURAL_NUMBER[Services.locale.appLocaleAsBCP47] ?? 0;
  },
};

/**
 * Private helper function to log errors to the error console and command line
 *
 * @param aMsg
 *        Error message to log or an array of strings to concat
 */
function log(aMsg) {
  const msg = "PluralForm.jsm: " + (aMsg.join ? aMsg.join("") : aMsg);
  Services.console.logStringMessage(msg);
  dump(msg + "\n");
}

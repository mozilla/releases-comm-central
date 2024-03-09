/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test various things about the font chooser window, including
 * - whether if the font defined in font.name.<style>.<language> is not present
 * on the computer, we fall back to displaying what's in
 * font.name-list.<style>.<language>.
 */

"use strict";

var { content_tab_e } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ContentTabHelpers.sys.mjs"
);
var { close_pref_tab, open_pref_tab } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/PrefTabHelpers.sys.mjs"
);
var { wait_for_frame_load } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

var { Preferences } = ChromeUtils.importESModule(
  "resource://gre/modules/Preferences.sys.mjs"
);

var gFontEnumerator;
var gTodayPane;

// We'll test with Western. Unicode has issues on Windows (bug 550443).
const kLanguage = "x-western";

// A list of fonts present on the computer for each font type.
var gRealFontLists = {};

// A list of font types to consider
const kFontTypes = ["serif", "sans-serif", "monospace"];

add_setup(async function () {
  if (AppConstants.platform == "win") {
    Services.prefs.setStringPref(
      "font.name-list.serif.x-western",
      "bc7e8c62-0634-467f-a029-fe6abcdf1582, Times New Roman"
    );
    Services.prefs.setStringPref(
      "font.name-list.sans-serif.x-western",
      "419129aa-43b7-40c4-b554-83d99b504b89, Arial"
    );
    Services.prefs.setStringPref(
      "font.name-list.monospace.x-western",
      "348df6e5-e874-4d21-ad4b-359b530a33b7, Courier New"
    );
  } else if (AppConstants.platform == "macosx") {
    Services.prefs.setStringPref(
      "font.name-list.serif.x-western",
      "bc7e8c62-0634-467f-a029-fe6abcdf1582, Times"
    );
    Services.prefs.setStringPref(
      "font.name-list.sans-serif.x-western",
      "419129aa-43b7-40c4-b554-83d99b504b89, Helvetica"
    );
    Services.prefs.setStringPref(
      "font.name-list.monospace.x-western",
      "348df6e5-e874-4d21-ad4b-359b530a33b7, Courier"
    );
  } else {
    Services.prefs.setStringPref(
      "font.name-list.serif.x-western",
      "bc7e8c62-0634-467f-a029-fe6abcdf1582, serif"
    );
    Services.prefs.setStringPref(
      "font.name-list.sans-serif.x-western",
      "419129aa-43b7-40c4-b554-83d99b504b89, sans-serif"
    );
    Services.prefs.setStringPref(
      "font.name-list.monospace.x-western",
      "348df6e5-e874-4d21-ad4b-359b530a33b7, monospace"
    );
  }

  let finished = false;
  buildFontList().then(() => (finished = true), console.error);
  await TestUtils.waitForCondition(
    () => finished,
    "Timeout waiting for font enumeration to complete."
  );

  // Hide Lightning's Today pane as it obscures buttons in preferences in the
  // small TB window our tests run in.
  gTodayPane = document.getElementById("today-pane-panel");
  if (gTodayPane) {
    if (!gTodayPane.collapsed) {
      EventUtils.synthesizeKey("VK_F11", {});
    } else {
      gTodayPane = null;
    }
  }
});

async function buildFontList() {
  gFontEnumerator = Cc["@mozilla.org/gfx/fontenumerator;1"].createInstance(
    Ci.nsIFontEnumerator
  );
  for (const fontType of kFontTypes) {
    gRealFontLists[fontType] = await gFontEnumerator.EnumerateFontsAsync(
      kLanguage,
      fontType
    );
    if (gRealFontLists[fontType].length == 0) {
      throw new Error(
        "No fonts found for language " +
          kLanguage +
          " and font type " +
          fontType +
          "."
      );
    }
  }
}

function assert_fonts_equal(aDescription, aExpected, aActual, aPrefix = false) {
  if (
    !(
      (!aPrefix && aExpected == aActual) ||
      (aPrefix && aActual.startsWith(aExpected))
    )
  ) {
    throw new Error(
      "The " +
        aDescription +
        " font should be '" +
        aExpected +
        "', but " +
        (aActual.length == 0
          ? "nothing is actually selected."
          : "is actually: " + aActual + ".")
    );
  }
}

/**
 * Verify that the given fonts are displayed in the font chooser. This opens the
 * pref window to the display pane and checks that, then opens the font chooser
 * and checks that too.
 */
async function _verify_fonts_displayed(
  aDefaults,
  aSerif,
  aSansSerif,
  aMonospace
) {
  // Bring up the preferences window.
  const prefTab = await open_pref_tab("paneGeneral");
  const contentDoc = prefTab.browser.contentDocument;
  const prefsWindow = contentDoc.ownerGlobal;
  prefsWindow.resizeTo(screen.availWidth, screen.availHeight);

  const isSansDefault =
    Services.prefs.getCharPref("font.default." + kLanguage) == "sans-serif";
  const displayPaneExpected = isSansDefault ? aSansSerif : aSerif;
  const displayPaneActual = content_tab_e(prefTab, "defaultFont");
  await TestUtils.waitForCondition(
    () => displayPaneActual.itemCount > 0,
    "No font names were populated in the font picker."
  );
  assert_fonts_equal(
    "display pane",
    displayPaneExpected,
    displayPaneActual.value
  );

  const advancedFonts = contentDoc.getElementById("advancedFonts");
  advancedFonts.scrollIntoView(false);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  // Now open the advanced dialog.
  EventUtils.synthesizeMouseAtCenter(advancedFonts, {}, prefsWindow);
  const fontc = await wait_for_frame_load(
    prefsWindow.gSubDialog._topDialog._frame,
    "chrome://messenger/content/preferences/fonts.xhtml"
  );

  // The font pickers are populated async so we need to wait for it.
  for (const fontElemId of ["serif", "sans-serif", "monospace"]) {
    await TestUtils.waitForCondition(
      () => fontc.document.getElementById(fontElemId).label != "",
      "Timeout waiting for font picker '" + fontElemId + "' to populate."
    );
  }

  if (!aDefaults) {
    assert_fonts_equal(
      "serif",
      aSerif,
      fontc.document.getElementById("serif").value
    );
    assert_fonts_equal(
      "sans-serif",
      aSansSerif,
      fontc.document.getElementById("sans-serif").value
    );
    assert_fonts_equal(
      "monospace",
      aMonospace,
      fontc.document.getElementById("monospace").value
    );
  } else if (AppConstants.platform == "linux") {
    // When default fonts are displayed in the menulist, there is no value set,
    // only the label, in the form "Default (font name)".

    // On Linux the prefs we set contained only the generic font names,
    // like 'serif', but here a specific font name will be shown, but it is
    // system-dependent what it will be. So we just check for the 'Default'
    // prefix.
    assert_fonts_equal(
      "serif",
      `Default (`,
      fontc.document.getElementById("serif").label,
      true
    );
    assert_fonts_equal(
      "sans-serif",
      `Default (`,
      fontc.document.getElementById("sans-serif").label,
      true
    );
    assert_fonts_equal(
      "monospace",
      `Default (`,
      fontc.document.getElementById("monospace").label,
      true
    );
  } else {
    assert_fonts_equal(
      "serif",
      `Default (${aSerif})`,
      fontc.document.getElementById("serif").label
    );
    assert_fonts_equal(
      "sans-serif",
      `Default (${aSansSerif})`,
      fontc.document.getElementById("sans-serif").label
    );
    assert_fonts_equal(
      "monospace",
      `Default (${aMonospace})`,
      fontc.document.getElementById("monospace").label
    );
  }

  close_pref_tab(prefTab);
}

/**
 * Test that for a particular language, whatever's in
 * font.name.<type>.<language> is displayed in the font chooser (if it is
 * present on the computer).
 */
add_task(async function test_font_name_displayed() {
  Services.prefs.setCharPref("font.language.group", kLanguage);

  // Pick the first font for each font type and set it.
  const expected = {};
  for (const [fontType, fontList] of Object.entries(gRealFontLists)) {
    // Work around bug 698238 (on Windows, Courier is returned by the enumerator but
    // substituted with Courier New) by getting the standard (substituted) family
    // name for each font.
    const standardFamily = gFontEnumerator.getStandardFamilyName(fontList[0]);
    Services.prefs.setCharPref(
      "font.name." + fontType + "." + kLanguage,
      standardFamily
    );
    expected[fontType] = standardFamily;
  }

  const fontTypes = kFontTypes.map(fontType => expected[fontType]);
  await _verify_fonts_displayed(false, ...fontTypes);
  teardownTest();
});

// Fonts definitely not present on a computer -- we simply use UUIDs. These
// should be kept in sync with the ones in *-prefs.js.
const kFakeFonts = {
  serif: "bc7e8c62-0634-467f-a029-fe6abcdf1582",
  "sans-serif": "419129aa-43b7-40c4-b554-83d99b504b89",
  monospace: "348df6e5-e874-4d21-ad4b-359b530a33b7",
};

/**
 * Test that for a particular language, if font.name.<type>.<language> is not
 * present on the computer, we fall back to displaying what's in
 * font.name-list.<type>.<language>.
 */
add_task(async function test_font_name_not_present() {
  Services.prefs.setCharPref("font.language.group", kLanguage);

  // The fonts we're expecting to see selected in the font chooser for
  // test_font_name_not_present.
  const expected = {};
  for (const [fontType, fakeFont] of Object.entries(kFakeFonts)) {
    // Look at the font.name-list. We need to verify that the first font is the
    // fake one, and that the second one is present on the user's computer.
    const listPref = "font.name-list." + fontType + "." + kLanguage;
    const fontList = Services.prefs.getCharPref(listPref);
    const fonts = fontList.split(",").map(font => font.trim());
    if (fonts.length != 2) {
      throw new Error(
        listPref +
          " should have exactly two fonts, but it is '" +
          fontList +
          "'."
      );
    }

    if (fonts[0] != fakeFont) {
      throw new Error(
        "The first font in " +
          listPref +
          " should be '" +
          fakeFont +
          "', but is actually: " +
          fonts[0] +
          "."
      );
    }

    if (!gRealFontLists[fontType].includes(fonts[1])) {
      throw new Error(
        "The second font in " +
          listPref +
          " (" +
          fonts[1] +
          ") should be present on this computer, but isn't."
      );
    }
    expected[fontType] = fonts[1];

    // Set font.name to be a nonsense name that shouldn't exist.
    // font.name-list is handled by wrapper.py.
    Services.prefs.setCharPref(
      "font.name." + fontType + "." + kLanguage,
      fakeFont
    );
  }

  const fontTypes = kFontTypes.map(fontType => expected[fontType]);
  await _verify_fonts_displayed(true, ...fontTypes);
  teardownTest();
});

function teardownTest() {
  // nsIPrefBranch.resetBranch() is not implemented in M-C, so we can't use
  // Services.prefs.resetBranch().
  Preferences.resetBranch("font.name.");
}

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("font.language.group");
  if (gTodayPane && gTodayPane.collapsed) {
    EventUtils.synthesizeKey("VK_F11", {});
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

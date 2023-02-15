/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { BUTTON_STYLE_MAP, BUTTON_STYLE_PREF } = ChromeUtils.importESModule(
  "resource:///modules/ButtonStyle.mjs"
);

add_task(function test_buttonStyleMap() {
  Assert.ok(Array.isArray(BUTTON_STYLE_MAP), "BUTTON_STYLE_MAP is an array");
  Assert.ok(
    BUTTON_STYLE_MAP.every(style => typeof style === "string"),
    "All entries in the style map should be strings"
  );
  for (const style of BUTTON_STYLE_MAP) {
    Assert.stringMatches(
      style,
      /[a-z-]/,
      "Button style class should be formatted in kebab case"
    );
  }
});

add_task(function test_buttonStylePref() {
  Assert.equal(
    typeof BUTTON_STYLE_PREF,
    "string",
    "BUTTON_STYLE_PREF is a string"
  );
  const prefValue = Services.prefs.getIntPref(BUTTON_STYLE_PREF, 0);
  Assert.ok(
    Number.isInteger(prefValue),
    "BUTTON_STYLE_PREF pref should hold an integer"
  );
  Assert.less(
    prefValue,
    BUTTON_STYLE_MAP.length,
    "Value of BUTTON_STYLE_PREF should be within map"
  );
});

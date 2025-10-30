/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * This unit test makes sure the plural form for Irish Gaelic is working.
 */

const { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);

function run_test() {
  const origAvLocales = Services.locale.availableLocales;
  registerCleanupFunction(() => {
    Services.locale.availableLocales = origAvLocales;
  });

  Services.locale.availableLocales = ["ga-IE", "en-US"];
  Services.locale.requestedLocales = ["ga-IE"];
  PluralForm.init();

  // Irish has 5 plural forms
  Assert.equal(5, PluralForm.numForms());

  // I don't really know Irish, so I'll stick in some dummy text
  const words = "is 1;is 2;is 3-6;is 7-10;everything else";

  const test = function (text, low, high) {
    for (let num = low; num <= high; num++) {
      Assert.equal(text, PluralForm.get(num, words));
    }
  };

  // Make sure for good inputs, things work as expected
  test("everything else", 0, 0);
  test("is 1", 1, 1);
  test("is 2", 2, 2);
  test("is 3-6", 3, 6);
  test("is 7-10", 7, 10);
  test("everything else", 11, 200);
}

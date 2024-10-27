/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { luminance, contrast, isTransparent, CONTRAST_THRESHOLD } =
  ChromeUtils.importESModule("chrome://messenger/content/DarkReader.mjs");

add_task(function testLuminance() {
  Assert.equal(
    luminance("not-a-color"),
    0,
    "A non valid CSS color should return 0"
  );
});

add_task(function testContrast() {
  Assert.greater(
    contrast("white", "black"),
    CONTRAST_THRESHOLD,
    "Foreground: white / Background: black should be above contrast"
  );
  Assert.less(
    contrast("white", "#ccc"),
    CONTRAST_THRESHOLD,
    "Foreground: white / Background: #ccc should be below contrast"
  );
});

add_task(function testTransparency() {
  Assert.ok(
    isTransparent("not-a-color"),
    "A non valid CSS color should be handled as a transparent value"
  );
  Assert.ok(
    !isTransparent("#000"),
    "Black short hex should not be transparent"
  );
  Assert.ok(
    isTransparent("#00000000"),
    "Black alpha hex should be transparent"
  );
  Assert.ok(
    !isTransparent("rgb(255, 255, 255)"),
    "White rgb should not be transparent"
  );
  Assert.ok(
    isTransparent("rgb(255, 255, 255, 0)"),
    "White rgba should be transparent"
  );
});

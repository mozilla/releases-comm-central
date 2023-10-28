/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test removing styling from messages.
 */

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

add_task(async function test_remove_text_styling() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const NO_SIZE = formatHelper.NO_SIZE;

  const removeButton = formatHelper.removeStylingButton;
  const removeItem = formatHelper.removeStylingMenuItem;

  // Before focus.
  Assert.ok(
    removeButton.disabled,
    "Remove button should be disabled before focus"
  );

  formatHelper.focusMessage();

  Assert.ok(
    !removeButton.disabled,
    "Remove button should be enabled after focus"
  );

  async function assertShown(styleSet, font, size, color, state, message) {
    await formatHelper.assertShownStyles(styleSet, message);
    await formatHelper.assertShownFont(font, message);
    await formatHelper.assertShownSize(size, message);
    await formatHelper.assertShownColor(color, message);
    await formatHelper.assertShownParagraphState(state, message);
  }

  const styleSet = [
    formatHelper.styleDataMap.get("underline"),
    formatHelper.styleDataMap.get("superscript"),
    formatHelper.styleDataMap.get("strong"),
  ];
  const tags = new Set();
  styleSet.forEach(style => tags.add(style.tag));

  const color = { value: "#0000ff", rgb: [0, 0, 255] };
  const font = formatHelper.commonFonts[0];
  const size = 4;

  // In paragraph state.

  for (const style of styleSet) {
    await formatHelper.selectStyle(style);
  }
  await formatHelper.selectColor(color.value);
  await formatHelper.selectFont(font);
  await formatHelper.selectSize(size);

  const text = "some text to apply styling to";
  await formatHelper.typeInMessage(text);

  formatHelper.assertMessageParagraph(
    [{ tags, color: color.value, font, size, text }],
    "Initial styled text"
  );
  await assertShown(styleSet, font, size, color, "p", "Set styling and typing");

  removeButton.click();
  await assertShown(null, "", NO_SIZE, "", "p", "Clicked to stop style");

  let moreText = " without any styling";
  await formatHelper.typeInMessage(moreText);
  await assertShown(null, "", NO_SIZE, "", "p", "Typing with no styling");

  formatHelper.assertMessageParagraph(
    [{ tags, color: color.value, font, size, text }, moreText],
    "Unstyled at end"
  );

  // Initialize some styling for the next typed character.
  // Don't select any Text Styles because of Bug 1716840.
  // for (let style of styleSet) {
  //   await formatHelper.selectStyle(style);
  // }
  await formatHelper.selectColor(color.value);
  await formatHelper.selectFont(font);
  await formatHelper.selectSize(size);

  await assertShown(null, font, size, color, "p", "Getting some styling ready");

  // Select through menu.
  await formatHelper.selectFromFormatMenu(removeItem);
  await assertShown(null, "", NO_SIZE, "", "p", "Removed readied styling");

  await formatHelper.typeInMessage("a");
  moreText += "a";
  await assertShown(null, "", NO_SIZE, "", "p", "Still unstyled when typing");

  formatHelper.assertMessageParagraph(
    [{ tags, color: color.value, font, size, text }, moreText],
    "Remains unstyled at end"
  );

  await formatHelper.selectTextRange(0, 3);
  await assertShown(styleSet, font, size, color, "p", "Select start");

  removeButton.click();
  await assertShown(null, "", NO_SIZE, "", "p", "Selection is unstyled");
  formatHelper.assertMessageParagraph(
    [
      text.slice(0, 3),
      { tags, color: color.value, font, size, text: text.slice(3) },
      moreText,
    ],
    "Becomes unstyled at start"
  );

  await formatHelper.selectTextRange(1, text.length + 3);
  // Mixed selection
  // See Bug 1718227 (the size menu does not respond to mixed selections)
  // await assertShown(null, null, null, null, "p", "Select mixed");

  // Select through menu.
  await formatHelper.selectFromFormatMenu(removeItem);
  await assertShown(null, "", NO_SIZE, "", "p", "Mixed selection now unstyled");
  formatHelper.assertMessageParagraph(
    [text + moreText],
    "Style is fully stripped"
  );

  await close_compose_window(win);
});

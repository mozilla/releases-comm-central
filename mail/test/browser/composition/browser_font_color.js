/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test font color in messages.
 */

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

add_task(async function test_font_color() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const colorSet = [
    { value: "#0000ff", rgb: [0, 0, 255] },
    { value: "#fb3e83", rgb: [251, 62, 131] },
  ];

  // Before focus, disabled.
  Assert.ok(
    formatHelper.colorSelector.hasAttribute("disabled"),
    "Selector should be disabled with no focus"
  );

  formatHelper.focusMessage();
  Assert.ok(
    !formatHelper.colorSelector.hasAttribute("disabled"),
    "Selector should be enabled with focus"
  );

  const firstText = "no color";
  const secondText = "with color";

  for (const color of colorSet) {
    const value = color.value;
    await formatHelper.assertShownColor("", `No color at start (${value})`);

    await formatHelper.typeInMessage(firstText);
    formatHelper.assertMessageParagraph(
      [firstText],
      `No color at start after typing (${value})`
    );

    // Select through toolbar.
    await formatHelper.selectColor(value);
    await formatHelper.assertShownColor(color, `Color ${value} selected`);

    await formatHelper.typeInMessage(secondText);
    await formatHelper.assertShownColor(
      color,
      `Color ${value} selected and typing`
    );
    formatHelper.assertMessageParagraph(
      [firstText, { text: secondText, color: value }],
      `${value} on second half`
    );

    // Test text selections.
    for (const [start, end, forward, expect] of [
      // Make sure we expect changes, so the test does not capture the previous
      // state.
      [0, null, true, ""], // At start.
      [firstText.length + 1, null, true, color], // In the color region.
      [0, firstText.length + secondText.length, true, null], // Mixed.
      [firstText.length, null, true, ""], // Boundary travelling forward.
      [firstText.length, null, false, color], // On boundary travelling backward.
    ]) {
      await formatHelper.selectTextRange(start, end, forward);
      await formatHelper.assertShownColor(
        expect,
        `Selecting text with ${value}, from ${start} to ${end} ` +
          `${forward ? "forwards" : "backwards"}`
      );
    }

    // Select mixed.
    await formatHelper.selectTextRange(3, firstText.length + 1);
    await formatHelper.assertShownColor(null, `Mixed selection (${value})`);

    // Select the same color.
    await formatHelper.selectColor(value);
    await formatHelper.assertShownColor(
      color,
      `Selected ${value} color on more`
    );
    formatHelper.assertMessageParagraph(
      [
        firstText.slice(0, 3),
        { text: firstText.slice(3) + secondText, color: value },
      ],
      `${value} color on more`
    );

    // Select the default color.
    const selector = formatHelper.selectColorInDialog(null);
    // Select through Format menu.
    formatHelper.selectFromFormatMenu(formatHelper.colorMenuItem);
    await selector;
    await formatHelper.assertShownColor("", `Unselected ${value} color`);
    formatHelper.assertMessageParagraph(
      [
        firstText + secondText.slice(0, 1),
        { text: secondText.slice(1), color: value },
      ],
      `Cleared some ${value} color`
    );

    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

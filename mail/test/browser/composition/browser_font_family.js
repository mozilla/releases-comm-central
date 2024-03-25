/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test font family in messages.
 */

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_task(async function test_font_family() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  // Before focus, disabled.
  Assert.ok(
    formatHelper.fontSelector.disabled,
    "Selector should be disabled with no focus"
  );

  formatHelper.focusMessage();
  Assert.ok(
    !formatHelper.fontSelector.disabled,
    "Selector should be enabled with focus"
  );

  const firstText = "no font";
  const secondText = "with font";

  // Only test standard fonts.
  for (const font of formatHelper.commonFonts) {
    await formatHelper.assertShownFont("", `Variable width at start (${font})`);

    await formatHelper.typeInMessage(firstText);
    formatHelper.assertMessageParagraph(
      [firstText],
      `No font family at start after typing (${font})`
    );

    // Select through toolbar.
    await formatHelper.selectFont(font);
    await formatHelper.assertShownFont(font, `Changed to "${font}"`);

    await formatHelper.typeInMessage(secondText);
    await formatHelper.assertShownFont(font, `Still "${font}" when typing`);
    formatHelper.assertMessageParagraph(
      [firstText, { text: secondText, font }],
      `"${font}" on second half`
    );

    // Test text selections.
    for (const [start, end, forward, expect] of [
      // Make sure we expect changes, so the test does not capture the previous
      // state.
      [0, null, true, ""], // At start.
      [firstText.length + 1, null, true, font], // In the font region.
      [0, firstText.length + secondText.length, true, null], // Mixed.
      [firstText.length, null, true, ""], // On boundary travelling forward.
      [firstText.length, null, false, font], // On boundary travelling backward.
    ]) {
      await formatHelper.selectTextRange(start, end, forward);
      await formatHelper.assertShownFont(
        expect,
        `Selecting text with "${font}", from ${start} to ${end} ` +
          `${forward ? "forwards" : "backwards"}`
      );
    }

    // Select mixed.
    await formatHelper.selectTextRange(3, firstText.length + 1);
    await formatHelper.assertShownFont(null, `Mixed selection (${font})`);
    // Select through menu.
    const item = formatHelper.getFontMenuItem(font);
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.fontMenu);
    // See Bug 1718225
    // await formatHelper.assertShownFont(font, `"${font}" on more`);
    formatHelper.assertMessageParagraph(
      [firstText.slice(0, 3), { text: firstText.slice(3) + secondText, font }],
      `"${font}" on more`
    );

    await formatHelper.selectFont("");
    await formatHelper.assertShownFont("", `Cleared some "${font}"`);
    formatHelper.assertMessageParagraph(
      [firstText + secondText.slice(0, 1), { text: secondText.slice(1), font }],
      `Cleared some "${font}"`
    );

    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

add_task(async function test_fixed_width() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const ttStyleItem = formatHelper.getStyleMenuItem("tt");

  formatHelper.focusMessage();

  // Currently, when the monospace font family is selected the UI is updated to
  // show the tt style as selected (even though the underlying document still
  // uses <font face="monospace"> rather than <tt>).

  await formatHelper.selectFont("monospace");
  await formatHelper.assertShownFont("monospace", "Changed to monospace");
  // See Bug 1716840
  // await formatHelper.assertShownStyles(
  //   "tt",
  //   "tt style shown after setting to Fixed Width",
  // );
  const text = "monospace text content";
  await formatHelper.typeInMessage(text);
  await formatHelper.assertShownFont(
    "monospace",
    "Still monospace when typing"
  );
  await formatHelper.assertShownStyles(
    "tt",
    "tt style shown after setting to Fixed Width and typing"
  );
  formatHelper.assertMessageParagraph(
    [{ text, font: "monospace" }],
    "monospace text"
  );

  // Trying to unset the font using Text Styles -> Fixed Width is ignored.
  // NOTE: This is currently asymmetric: i.e. the Text Styles -> Fixed Width
  // style *can* be removed by changing the Font to Variable Width.
  await formatHelper.selectFromFormatSubMenu(
    ttStyleItem,
    formatHelper.styleMenu
  );
  await formatHelper.assertShownFont("monospace", "Still monospace");
  await formatHelper.typeInMessage("+");
  await formatHelper.assertShownFont("monospace", "Still monospace after key");
  formatHelper.assertMessageParagraph(
    [{ text: text + "+", font: "monospace" }],
    "still produce monospace text"
  );

  await close_compose_window(win);
});

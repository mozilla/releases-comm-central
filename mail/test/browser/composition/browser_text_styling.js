/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test styling messages.
 */

requestLongerTimeout(3);

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_task(async function test_style_buttons() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const buttonSet = [
    { name: "bold", tag: "B", node: formatHelper.boldButton },
    { name: "italic", tag: "I", node: formatHelper.italicButton },
    { name: "underline", tag: "U", node: formatHelper.underlineButton },
  ];

  // Without focus on message.
  for (const button of buttonSet) {
    Assert.ok(
      button.node.disabled,
      `${button.name} button should be disabled with no focus`
    );
  }

  formatHelper.focusMessage();

  // With focus on message.
  for (const button of buttonSet) {
    Assert.ok(
      !button.node.disabled,
      `${button.name} button should be enabled with focus`
    );
  }

  async function selectTextAndToggleButton(
    start,
    end,
    button,
    enables,
    message
  ) {
    await formatHelper.selectTextRange(start, end);
    await formatHelper.assertShownStyles(
      enables ? null : [button.name],
      `${message}: Before toggle`
    );
    button.node.click();
    await formatHelper.assertShownStyles(
      enables ? [button.name] : null,
      `${message}: Before toggle`
    );
  }

  for (const button of buttonSet) {
    const name = button.name;
    const tags = new Set();
    tags.add(button.tag);

    await formatHelper.assertShownStyles(
      null,
      `No shown styles at the start (${name})`
    );
    button.node.click();
    await formatHelper.assertShownStyles(
      [name],
      `${name} is shown after clicking`
    );
    const text = `test-${button.name}`;
    await formatHelper.typeInMessage(text);
    await formatHelper.assertShownStyles(
      [name],
      `${name} is shown after clicking and typing`
    );
    formatHelper.assertMessageParagraph(
      [{ tags, text }],
      `Clicking ${name} button and typing`
    );

    // Stop styling on click.
    const addedText = "not-styled";
    button.node.click();
    await formatHelper.assertShownStyles(
      null,
      `No longer ${name} after re-clicking`
    );
    await formatHelper.typeInMessage(addedText);
    await formatHelper.assertShownStyles(
      null,
      `No longer ${name} after re-clicking and typing`
    );
    formatHelper.assertMessageParagraph(
      [{ tags, text }, addedText],
      `Unclicking ${name} button and typing`
    );

    await formatHelper.deleteTextRange(
      text.length,
      text.length + addedText.length
    );
    formatHelper.assertMessageParagraph(
      [{ tags, text }],
      `Removed non-${name} region`
    );

    // Undo in region.
    await selectTextAndToggleButton(
      1,
      3,
      button,
      false,
      `Unchecking ${button.name} button for some region`
    );
    formatHelper.assertMessageParagraph(
      [{ tags, text: "t" }, "es", { tags, text: `t-${button.name}` }],
      `After unchecking ${button.name} button for some region`
    );

    // Redo over region.
    await selectTextAndToggleButton(
      1,
      3,
      button,
      true,
      `Rechecking ${button.name} button for some region`
    );
    formatHelper.assertMessageParagraph(
      [{ tags, text }],
      `After rechecking ${button.name} button for some region`
    );

    // Undo over whole text
    await selectTextAndToggleButton(
      0,
      text.length,
      button,
      false,
      `Unchecking ${button.name} button for whole text`
    );
    formatHelper.assertMessageParagraph(
      [text],
      `After unchecking ${button.name} button for whole text`
    );

    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

add_task(async function test_multi_style_with_buttons() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const boldButton = formatHelper.boldButton;
  const italicButton = formatHelper.italicButton;
  const underlineButton = formatHelper.underlineButton;

  formatHelper.focusMessage();

  const parts = ["bold", " and italic", " and underline"];

  boldButton.click();
  await formatHelper.typeInMessage(parts[0]);
  formatHelper.assertMessageParagraph(
    [{ tags: ["B"], text: parts[0] }],
    "Added bold"
  );
  await formatHelper.assertShownStyles(
    ["bold"],
    "After clicking bold and typing"
  );

  italicButton.click();
  await formatHelper.typeInMessage(parts[1]);
  formatHelper.assertMessageParagraph(
    [
      { tags: ["B"], text: parts[0] },
      { tags: ["B", "I"], text: parts[1] },
    ],
    "Added italic"
  );
  await formatHelper.assertShownStyles(
    ["bold", "italic"],
    "After clicking italic and typing"
  );

  underlineButton.click();
  await formatHelper.typeInMessage(parts[2]);
  formatHelper.assertMessageParagraph(
    [
      { tags: ["B"], text: parts[0] },
      { tags: ["B", "I"], text: parts[1] },
      { tags: ["B", "I", "U"], text: parts[2] },
    ],
    "Added underline"
  );
  await formatHelper.assertShownStyles(
    ["bold", "italic", "underline"],
    "After clicking underline and typing"
  );

  await formatHelper.selectTextRange(2, parts[0].length + parts[1].length + 2);
  await formatHelper.assertShownStyles(
    ["bold"],
    "Only bold when selecting all bold, mixed italic and mixed underline"
  );

  // Remove bold over selection.
  boldButton.click();
  formatHelper.assertMessageParagraph(
    [
      { tags: ["B"], text: parts[0].slice(0, 2) },
      parts[0].slice(2),
      { tags: ["I"], text: parts[1] },
      { tags: ["I", "U"], text: parts[2].slice(0, 2) },
      { tags: ["B", "I", "U"], text: parts[2].slice(2) },
    ],
    "Removed bold in middle"
  );

  await close_compose_window(win);
});

add_task(async function test_text_styling_whilst_typing() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  await formatHelper.assertShownStyles(null, "None checked");

  for (const style of formatHelper.styleDataMap.values()) {
    const tags = new Set();
    tags.add(style.tag);
    const name = style.name;

    // Start styling.
    await formatHelper.selectStyle(style);

    // See Bug 1716840.
    // await formatHelper.assertShownStyles(style, `${name} selected`);
    const text = `test-${name}`;
    await formatHelper.typeInMessage(text);
    await formatHelper.assertShownStyles(style, `${name} selected and typing`);
    formatHelper.assertMessageParagraph([{ tags, text }], `Selecting ${name}`);

    // Stop styling.
    await formatHelper.selectStyle(style);
    // See Bug 1716840.
    // await formatHelper.assertShownStyles(null, `${name} unselected`);
    const addedText = "not-styled";
    await formatHelper.typeInMessage(addedText);
    formatHelper.assertMessageParagraph(
      [{ tags, text }, addedText],
      `Unselecting ${name}`
    );
    await formatHelper.assertShownStyles(null, `${name} unselected and typing`);

    // Select these again to unselect for next loop cycle. Needs to be done
    // before empty paragraph since they happen only after "typing".
    if (style.linked) {
      await formatHelper.selectStyle(style.linked);
    }
    if (style.implies) {
      await formatHelper.selectStyle(style.implies);
    }
    await formatHelper.emptyParagraph();

    // Select again to unselect for next loop cycle.
    await formatHelper.selectStyle(style);
  }

  await close_compose_window(win);
});

add_task(async function test_text_styling_update_on_selection_change() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  for (const style of formatHelper.styleDataMap.values()) {
    const tags = new Set();
    tags.add(style.tag);
    const name = style.name;

    // Start styling.
    await formatHelper.selectStyle(style);
    const text = `test-${name}`;
    await formatHelper.typeInMessage(text);
    // Stop styling.
    await formatHelper.selectStyle(style);
    const addedText = "not-styled";
    await formatHelper.typeInMessage("not-styled");
    formatHelper.assertMessageParagraph(
      [{ tags, text }, addedText],
      `Unselecting ${name} and typing`
    );

    await formatHelper.assertShownStyles(null, `${name} unselected at end`);

    // Test selections.
    for (let [start, end, forward, expect] of [
      // Make sure we toggle, so the test does not capture the previous state.
      [0, null, true, true], // At start.
      [0, text.length + 1, true, false], // Mixed is unchecked.
      [text.length, null, true, true], // On boundary travelling forward.
      [text.length, null, false, false], // On boundary travelling backward.
      [2, 4, true, true], // In the styled region.
      [text.length, text.length + 1, true, false], // In the unstyled region.
    ]) {
      await formatHelper.selectTextRange(start, end, forward);
      if (expect) {
        expect = style;
      } else {
        expect = null;
      }
      await formatHelper.assertShownStyles(
        expect,
        `Selecting with ${name} style, from ${start} to ${end} ` +
          `${forward ? "forwards" : "backwards"}`
      );
    }
    if (style.linked) {
      await formatHelper.selectStyle(style.linked);
    }
    if (style.implies) {
      await formatHelper.selectStyle(style.implies);
    }
    await formatHelper.emptyParagraph();
    // Select again to unselect for next loop cycle.
    await formatHelper.selectStyle(style);
  }

  await close_compose_window(win);
});

add_task(async function test_text_styling_on_selections() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  let start;
  let end = 0;
  const parts = [];
  let fullText = "";
  for (const text of ["test for ", "styling some", " selections"]) {
    start = end;
    end += text.length;
    parts.push({ text, start, end });
    fullText += text;
  }
  await formatHelper.typeInMessage(fullText);
  formatHelper.assertMessageParagraph([fullText], "No styling at start");

  for (const style of formatHelper.styleDataMap.values()) {
    const tags = new Set();
    tags.add(style.tag);
    const name = style.name;

    formatHelper.assertMessageParagraph(
      [fullText],
      `No ${name} style at start`
    );

    await formatHelper.selectTextRange(parts[1].start, parts[1].end);
    await formatHelper.selectStyle(style);
    formatHelper.assertMessageParagraph(
      [parts[0].text, { tags, text: parts[1].text }, parts[2].text],
      `${name} in the middle`
    );

    await formatHelper.selectTextRange(parts[0].start, parts[2].end);
    await formatHelper.selectStyle(style);
    formatHelper.assertMessageParagraph(
      [{ tags, text: fullText }],
      `${name} on all`
    );

    // Undo in region.
    await formatHelper.selectTextRange(parts[1].start, parts[1].end);
    await formatHelper.selectStyle(style);
    formatHelper.assertMessageParagraph(
      [
        { tags, text: parts[0].text },
        parts[1].text,
        { tags, text: parts[2].text },
      ],
      `${name} not in the middle`
    );

    // Redo over region.
    await formatHelper.selectTextRange(parts[1].start, parts[1].end);
    await formatHelper.selectStyle(style);
    formatHelper.assertMessageParagraph(
      [{ tags, text: fullText }],
      `${name} on all again`
    );

    // Reset by unselecting all again.
    await formatHelper.selectTextRange(parts[0].start, parts[2].end);
    await formatHelper.selectStyle(style);
  }

  formatHelper.assertMessageParagraph([fullText], "No style at end");

  await close_compose_window(win);
});

add_task(async function test_induced_text_styling() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  for (const style of formatHelper.styleDataMap.values()) {
    if (!style.implies && !style.linked) {
      continue;
    }
    const tags = new Set();
    tags.add(style.tag);
    const name = style.name;

    // Start styling.
    await formatHelper.selectStyle(style);
    const text = `test-${name}`;
    await formatHelper.typeInMessage(text);
    await formatHelper.assertShownStyles(style, `${name} initial text`);
    formatHelper.assertMessageParagraph(
      [{ tags, text }],
      `${name} initial text`
    );

    if (style.implies) {
      // Unselecting implied styles will be ignored.
      const desc = `${style.implies.name} implied by ${name}`;
      await formatHelper.selectTextRange(0, text.length);
      await formatHelper.assertShownStyles(
        style,
        `Before trying to deselect ${desc}`
      );

      await formatHelper.selectStyle(style.implies);
      formatHelper.assertMessageParagraph(
        [{ tags, text }],
        `After trying to deselect ${desc}`
      );
      await formatHelper.assertShownStyles(
        style,
        `After trying to deselect ${desc}`
      );
    }
    if (style.linked) {
      // Unselecting the linked style also unselects the current one.
      const desc = `${style.linked.name} linked from ${name}`;
      await formatHelper.selectTextRange(0, text.length);
      await formatHelper.assertShownStyles(style, `Before unselecting ${desc}`);
      await formatHelper.selectStyle(style.linked);

      formatHelper.assertMessageParagraph([text], `After unselecting ${desc}`);
      await formatHelper.assertShownStyles(null, `After unselecting ${desc}`);
    }

    await formatHelper.emptyParagraph();
    // Select again to unselect for next loop cycle.
    if (style.linked) {
      await formatHelper.selectStyle(style.linked);
    }
    if (style.implies) {
      await formatHelper.selectStyle(style.implies);
    }
    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

add_task(async function test_fixed_width_text_styling_font_change() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  await formatHelper.assertShownFont("", "Variable width to start");
  for (const style of formatHelper.styleDataMap.values()) {
    if (
      style.name !== "tt" &&
      style.linked?.name !== "tt" &&
      style.implies?.name !== "tt"
    ) {
      continue;
    }

    const tags = new Set();
    tags.add(style.tag);
    const name = style.name;

    // Start styling.
    await formatHelper.selectStyle(style);
    // See Bug 1716840.
    // await formatHelper.assertShownFont(
    //   "monospace",
    //   `monospace when ${name} selected`
    // );

    await formatHelper.typeInMessage(`test-${name}`);
    await formatHelper.assertShownFont(
      "monospace",
      `monospace when ${name} selected and typing`
    );

    // Stop styling.
    await formatHelper.selectStyle(style);
    // See Bug 1716840.
    // await formatHelper.assertShownFont(
    //   "",
    //   `Variable Width when ${name} unselected`
    // );

    await formatHelper.typeInMessage("test-none");
    await formatHelper.assertShownFont(
      "",
      `Variable Width when ${name} unselected and typing`
    );

    await formatHelper.selectTextRange(1, 3);
    await formatHelper.assertShownFont(
      "monospace",
      `monospace when ${name} region highlighted`
    );
    // Select the same font does nothing
    await formatHelper.selectFont("monospace");
    formatHelper.assertMessageParagraph(
      [{ tags, text: `test-${name}` }, "test-none"],
      `No change when ${name} region has monospace selected`
    );

    // Try to change the font selection to variable width.
    await formatHelper.selectFont("");
    if (name === "tt") {
      // "tt" style is removed.
      formatHelper.assertMessageParagraph(
        [{ tags, text: "t" }, "es", { tags, text: `t-${name}` }, "test-none"],
        `variable width when ${name} region has font unset`
      );
      await formatHelper.assertShownFont(
        "",
        `Variable Width when ${name} region has font unset`
      );
      // Reset by selecting the style.
      // Note: Reselecting the "monospace" font will not add the tt style back.
      await formatHelper.selectStyle(style);
    }
    // Otherwise, the style is unchanged.
    formatHelper.assertMessageParagraph(
      [{ tags, text: `test-${name}` }, "test-none"],
      `Still ${name} style in region`
    );
    await formatHelper.assertShownFont(
      "monospace",
      `Still monospace for ${name} region`
    );

    // Change the font to something else.
    const font = formatHelper.commonFonts[0];
    await formatHelper.selectFont(font);
    // Doesn't remove the style, but adds the font.
    formatHelper.assertMessageParagraph(
      [
        { tags, text: "t" },
        // See Bug 1718779
        // Whilst the font covers this region, it is actually suppressed by the
        // styling tags. In this case, the ordering of the <font> and, e.g.,
        // <tt> element matters.
        { tags, font, text: "es" },
        { tags, text: `t-${name}` },
        "test-none",
      ],
      `"${font}" when ${name} region has font set`
    );
    // See Bug 1718779
    // The desired font is shown at first, but then switches to Fixed Width
    // again.
    // await formatHelper.assertShownFont(
    //  font,
    //  `"${font}" when ${name} region has font set`
    //);

    await formatHelper.emptyParagraph();
    // Select again to unselect for next loop cycle.
    if (style.linked) {
      await formatHelper.selectStyle(style.linked);
    }
    if (style.implies) {
      await formatHelper.selectStyle(style.implies);
    }
    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

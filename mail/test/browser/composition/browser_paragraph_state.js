/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test paragraph state.
 */

requestLongerTimeout(2);

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_task(async function test_newline_p() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const firstText = "first line";
  const secondText = "second line";
  const thirdText = "third line";

  formatHelper.focusMessage();

  await formatHelper.selectParagraphState("p");
  await formatHelper.typeInMessage(firstText);

  // Pressing Enter, without Shift, creates a new block.
  await formatHelper.typeEnterInMessage(false);
  formatHelper.assertMessageBodyContent(
    // Empty "P" block must contain some content, otherwise it will collapse,
    // currently this is achieved with a <BR>.
    [
      { block: "P", content: [firstText] },
      { block: "P", content: ["<BR>"] },
    ],
    "After Enter (no Shift)"
  );
  await formatHelper.typeInMessage(secondText);
  formatHelper.assertMessageBodyContent(
    [
      { block: "P", content: [firstText] },
      { block: "P", content: [secondText] },
    ],
    "After Enter (no Shift) and typing"
  );

  // Pressing Shift+Enter creates a break.
  await formatHelper.typeEnterInMessage(true);
  formatHelper.assertMessageBodyContent(
    [
      { block: "P", content: [firstText] },
      // NOTE: that the two <BR> are necessary, the first produces the newline,
      // whilst the second stops the new line from collapsing without any text.
      { block: "P", content: [secondText + "<BR><BR>"] },
    ],
    "After Shift+Enter"
  );
  await formatHelper.typeInMessage(thirdText);
  formatHelper.assertMessageBodyContent(
    [
      { block: "P", content: [firstText] },
      // NOTE: with the next line being non-empty, the extra <BR> is no longer
      // needed to stop the line from collapsing.
      { block: "P", content: [secondText + "<BR>" + thirdText] },
    ],
    "After Shift+Enter and typing"
  );

  await close_compose_window(win);
});

add_task(async function test_newline_headers() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const firstText = "first line";
  const secondText = "second line";
  const thirdText = "third line";

  formatHelper.focusMessage();

  for (let num = 1; num <= 6; num++) {
    const state = `h${num}`;
    const block = `H${num}`;

    await formatHelper.selectParagraphState(state);
    await formatHelper.typeInMessage(firstText);

    // Pressing Shift+Enter creates a break.
    await formatHelper.typeEnterInMessage(true);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [firstText + "<BR><BR>"] }],
      `After Shift+Enter in ${state}`
    );
    await formatHelper.typeInMessage(secondText);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [firstText + "<BR>" + secondText] }],
      `After Shift+Enter in ${state} and typing`
    );

    // Pressing Enter, without Shift, creates a new paragraph.
    await formatHelper.typeEnterInMessage(false);
    formatHelper.assertMessageBodyContent(
      [
        { block, content: [firstText + "<BR>" + secondText] },
        { block: "P", content: ["<BR>"] },
      ],
      `After Enter (no Shift) in ${state}`
    );

    await formatHelper.assertShownParagraphState(
      "p",
      `Shows paragraph state after Enter (no Shift) in ${state}`
    );

    await formatHelper.typeInMessage(thirdText);
    formatHelper.assertMessageBodyContent(
      [
        { block, content: [firstText + "<BR>" + secondText] },
        { block: "P", content: [thirdText] },
      ],
      `After Enter (no Shift) in ${state} and typing`
    );

    await formatHelper.deleteAll();
  }

  await close_compose_window(win);
});

add_task(async function test_newline_pre_and_address() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const firstText = "first line";
  const secondText = "second line";
  const thirdText = "third line";

  formatHelper.focusMessage();

  for (const state of ["pre", "address"]) {
    const block = state.toUpperCase();

    await formatHelper.selectParagraphState(state);
    await formatHelper.typeInMessage(firstText);

    // Pressing Shift+Enter creates a break.
    await formatHelper.typeEnterInMessage(true);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [firstText + "<BR><BR>"] }],
      `After Shift+Enter in ${state}`
    );
    await formatHelper.typeInMessage(secondText);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [firstText + "<BR>" + secondText] }],
      `After Shift+Enter in ${state} and typing`
    );

    // Pressing Enter, without Shift, does the same.
    await formatHelper.typeEnterInMessage(false);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [firstText + "<BR>" + secondText + "<BR><BR>"] }],
      `After Enter (no Shift) in ${state}`
    );

    await formatHelper.typeInMessage(thirdText);
    formatHelper.assertMessageBodyContent(
      [
        {
          block,
          content: [firstText + "<BR>" + secondText + "<BR>" + thirdText],
        },
      ],
      `After Enter (no Shift) in ${state} and typing`
    );

    await formatHelper.deleteAll();
  }

  await close_compose_window(win);
});

add_task(async function test_newline_body() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const firstText = "first line";
  const secondText = "second line";
  const thirdText = "third line";

  formatHelper.focusMessage();

  await formatHelper.selectParagraphState("");
  await formatHelper.typeInMessage(firstText);

  // Pressing Shift+Enter creates a break.
  await formatHelper.typeEnterInMessage(true);
  formatHelper.assertMessageBodyContent(
    [firstText + "<BR><BR>"],
    "After Shift+Enter in body"
  );
  await formatHelper.typeInMessage(secondText);
  formatHelper.assertMessageBodyContent(
    [firstText + "<BR>" + secondText],
    "After Shift+Enter in body and typing"
  );

  // Pressing Enter, without Shift, either side of the Enter get converted into
  // paragraphs.
  await formatHelper.typeEnterInMessage(false);
  formatHelper.assertMessageBodyContent(
    [
      firstText,
      { block: "P", content: [secondText] },
      { block: "P", content: ["<BR>"] },
    ],
    "After Enter (no Shift) in body"
  );
  await formatHelper.assertShownParagraphState(
    "p",
    "Shows paragraph state after Enter (no Shift) in body"
  );

  await formatHelper.typeInMessage(thirdText);
  formatHelper.assertMessageBodyContent(
    [
      firstText,
      { block: "P", content: [secondText] },
      { block: "P", content: [thirdText] },
    ],
    "After Enter (no Shift) in ${state} and typing"
  );

  await close_compose_window(win);
});

async function initialiseParagraphs(formatHelper) {
  const blockSet = [];
  let start = 0;
  let first = true;
  for (const text of ["first block", "second block", "third block"]) {
    if (first) {
      first = false;
    } else {
      await formatHelper.typeEnterInMessage();
    }
    await formatHelper.typeInMessage(text);

    const end = start + text.length;
    blockSet.push({ text, start, end });
    start = end + 1; // Plus newline.
  }

  return blockSet;
}

add_task(async function test_non_body_paragraph_state() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  // NOTE: we don't start with the default paragraph state because we want to
  // detect a *change* in the paragraph state from the previous state.
  const stateSet = ["address", "pre"];
  for (let i = 1; i <= 6; i++) {
    stateSet.push(`h${i}`);
  }
  stateSet.push("p");

  // Before focus, disabled.
  Assert.ok(
    formatHelper.paragraphStateSelector.disabled,
    "Selector should be disabled with no focus"
  );

  formatHelper.focusMessage();
  Assert.ok(
    !formatHelper.paragraphStateSelector.disabled,
    "Selector should be enabled with focus"
  );

  // Initially in the paragraph state.
  await formatHelper.assertShownParagraphState("p", "Initial paragraph");

  const blockSet = await initialiseParagraphs(formatHelper);
  formatHelper.assertMessageBodyContent(
    [
      { block: "P", content: [blockSet[0].text] },
      { block: "P", content: [blockSet[1].text] },
      { block: "P", content: [blockSet[2].text] },
    ],
    "Three paragraphs"
  );

  let prevState = "p";
  for (const state of stateSet) {
    // Select end.
    const prevBlock = prevState.toUpperCase();
    const block = state.toUpperCase();
    await formatHelper.selectTextRange(blockSet[2].end);
    // Select through menu.
    await formatHelper.selectParagraphState(state);
    formatHelper.assertMessageBodyContent(
      [
        { block: prevBlock, content: [blockSet[0].text] },
        { block: prevBlock, content: [blockSet[1].text] },
        { block, content: [blockSet[2].text] },
      ],
      `${state} on last block`
    );

    await formatHelper.assertShownParagraphState(
      state,
      `${state} on last block`
    );
    // Select across second block.
    await formatHelper.selectTextRange(
      blockSet[1].start + 2,
      blockSet[1].end - 2
    );
    await formatHelper.assertShownParagraphState(
      prevState,
      `${state} on last block, with second block selected`
    );

    await formatHelper.selectFromFormatSubMenu(
      formatHelper.getParagraphStateMenuItem(state),
      formatHelper.paragraphStateMenu
    );
    formatHelper.assertMessageBodyContent(
      [
        { block: prevBlock, content: [blockSet[0].text] },
        { block, content: [blockSet[1].text] },
        { block, content: [blockSet[2].text] },
      ],
      `${state} on last two blocks`
    );

    // Select across first and second line.
    await formatHelper.selectTextRange(2, blockSet[1].start + 2);
    // Mixed state has no value.
    await formatHelper.assertShownParagraphState(
      null,
      `${state} on last two blocks, with mixed selection`
    );
    await formatHelper.selectParagraphState(state);

    formatHelper.assertMessageBodyContent(
      [
        { block, content: [blockSet[0].text] },
        { block, content: [blockSet[1].text] },
        { block, content: [blockSet[2].text] },
      ],
      `${state} on all blocks`
    );
    prevState = state;
  }

  await close_compose_window(win);
});

add_task(async function test_body_paragraph_state() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  const blockSet = await initialiseParagraphs(formatHelper);

  await formatHelper.selectTextRange(0);
  // Body state has value "".
  await formatHelper.selectParagraphState("");
  formatHelper.assertMessageBodyContent(
    [
      blockSet[0].text,
      { block: "P", content: [blockSet[1].text] },
      { block: "P", content: [blockSet[2].text] },
    ],
    "body on first block"
  );
  await formatHelper.assertShownParagraphState("", "body on first block");
  await formatHelper.selectTextRange(blockSet[1].start, blockSet[2].start + 1);
  await formatHelper.assertShownParagraphState("p", "last two selected");

  await formatHelper.selectFromFormatSubMenu(
    formatHelper.getParagraphStateMenuItem(""),
    formatHelper.paragraphStateMenu
  );
  formatHelper.assertMessageBodyContent(
    [blockSet[0].text + "<BR>" + blockSet[1].text + "<BR>" + blockSet[2].text],
    "body on all blocks"
  );

  await close_compose_window(win);
});

add_task(async function test_convert_from_body_paragraph_state() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const stateSet = ["p", "address", "pre"];
  for (let i = 1; i <= 6; i++) {
    stateSet.push(`h${i}`);
  }

  const firstText = "first line";
  const secondText = "second line";
  // Plus newline break.
  const fullLength = firstText.length + 1 + secondText.length;
  // The full first + second line as HTML, separater by a <br> tag.
  const fullTextHTML = firstText + "<BR>" + secondText;

  formatHelper.focusMessage();

  for (const state of stateSet) {
    const block = state.toUpperCase();

    await formatHelper.selectParagraphState("");
    await formatHelper.typeInMessage(firstText);
    await formatHelper.typeEnterInMessage(true);
    await formatHelper.typeInMessage(secondText);
    formatHelper.assertMessageBodyContent(
      [fullTextHTML],
      `body at start (${state})`
    );

    // Changing to a non-body state surrounds the existing text
    // with a block.
    await formatHelper.selectTextRange(0, fullLength);
    await formatHelper.selectParagraphState(state);
    formatHelper.assertMessageBodyContent(
      [{ block, content: [fullTextHTML] }],
      `${state} at end`
    );

    await formatHelper.deleteAll();
  }

  await close_compose_window(win);
});

add_task(async function test_heading_implies_bold() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  const boldItem = formatHelper.getStyleMenuItem("bold");
  const strongItem = formatHelper.getStyleMenuItem("strong");

  for (let num = 1; num <= 6; num++) {
    const state = `h${num}`;
    const block = `H${num}`;
    let text = "some text";

    await formatHelper.selectParagraphState(state);
    await formatHelper.assertShownStyles(
      "bold",
      `Bold on change to ${state} state`
    );
    await formatHelper.typeInMessage(text);
    await formatHelper.assertShownStyles(
      "bold",
      `Bold when typing in ${state} state`
    );
    formatHelper.assertMessageBodyContent(
      [{ block, content: [text] }],
      `${state} state, without any explicit styling`
    );

    // Trying to undo bold does nothing.
    formatHelper.boldButton.click();
    // See Bug 1718534
    // await formatHelper.assertShownStyles(
    //   "bold",
    //   `Still bold when clicking bold in the ${state} state`
    // );
    text += "a";
    await formatHelper.typeInMessage("a");
    formatHelper.assertMessageBodyContent(
      [{ block, content: [text] }],
      `${state} state, without style change, after clicking bold`
    );
    await formatHelper.assertShownStyles(
      "bold",
      `Still bold when clicking bold in the ${state} state and typing`
    );

    // Select through the style menu.
    await formatHelper.selectFromFormatSubMenu(
      boldItem,
      formatHelper.styleMenu
    );
    // See Bug 1718534
    // await formatHelper.assertShownStyles(
    //   "bold",
    //   `Still bold when selecting bold in the ${state} state`
    // );
    text += "b";
    await formatHelper.typeInMessage("b");
    formatHelper.assertMessageBodyContent(
      [{ block, content: [text] }],
      `${state} state, without style change, after selecting bold`
    );
    await formatHelper.assertShownStyles(
      "bold",
      `Still bold when selecting bold in the ${state} state and typing`
    );

    // Can still add and remove a style that implies bold.
    const strongText = " Strong ";
    await formatHelper.selectFromFormatSubMenu(
      strongItem,
      formatHelper.styleMenu
    );
    // See Bug 1716840
    // await formatHelper.assertShownStyles(
    //   "strong",
    //   `Selecting strong in ${state} state`
    // );
    await formatHelper.typeInMessage(strongText);
    await formatHelper.assertShownStyles(
      "strong",
      `Selecting strong in ${state} state and typing`
    );
    // Deselect.
    await formatHelper.selectFromFormatSubMenu(
      strongItem,
      formatHelper.styleMenu
    );
    // See Bug 1716840
    // await formatHelper.assertShownStyles(
    //   "bold",
    //   `UnSelecting strong in ${state} state`
    // );

    const moreText = "more";
    await formatHelper.typeInMessage(moreText);
    await formatHelper.assertShownStyles(
      "bold",
      `UnSelecting strong in ${state} state and typing`
    );

    formatHelper.assertMessageBodyContent(
      [
        {
          block,
          content: [text, { tags: ["STRONG"], text: strongText }, moreText],
        },
      ],
      `Strong region in ${state} state`
    );

    // Change to paragraph.
    await formatHelper.selectParagraphState("p");
    await formatHelper.assertShownStyles(
      null,
      `Lose bold when switching to Paragraph from ${state} state`
    );
    formatHelper.assertMessageBodyContent(
      [
        {
          block: "P",
          content: [text, { tags: ["STRONG"], text: strongText }, moreText],
        },
      ],
      `Paragraph block from ${state} state`
    );

    // NOTE: Switching from "p" state to a heading state will *not* remove the
    // bold tags.

    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

add_task(async function test_address_implies_italic() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  const italicItem = formatHelper.getStyleMenuItem("italic");

  const otherStyles = Array.from(formatHelper.styleDataMap.values()).filter(
    data => data.implies?.name === "italic" || data.linked?.name === "italic"
  );

  const block = "ADDRESS";
  let text = "some text";

  await formatHelper.selectParagraphState("address");
  await formatHelper.assertShownStyles(
    "italic",
    "Italic on change to address state"
  );
  await formatHelper.typeInMessage(text);
  await formatHelper.assertShownStyles(
    "italic",
    "Italic when typing in address state"
  );
  formatHelper.assertMessageBodyContent(
    [{ block, content: [text] }],
    "Address state, without any explicit styling"
  );

  // Trying to undo italic does nothing.
  formatHelper.italicButton.click();
  // See Bug 1718534
  // await formatHelper.assertShownStyles(
  //   "italic",
  //   "Still italic when clicking italic in the address state"
  // );
  text += "a";
  await formatHelper.typeInMessage("a");
  formatHelper.assertMessageBodyContent(
    [{ block, content: [text] }],
    "Address state, without style change, after clicking italic"
  );
  await formatHelper.assertShownStyles(
    "italic",
    "Still italic when clicking italic in the address state and typing"
  );

  // Select through the style menu.
  await formatHelper.selectFromFormatSubMenu(
    italicItem,
    formatHelper.styleMenu
  );
  // See Bug 1718534
  // await formatHelper.assertShownStyles(
  //   "italic",
  //   "Still italic when selecting italic in the address state"
  // );
  text += "b";
  await formatHelper.typeInMessage("b");
  formatHelper.assertMessageBodyContent(
    [{ block, content: [text] }],
    "Address state, without style change, after selecting italic"
  );
  await formatHelper.assertShownStyles(
    "italic",
    "Still italic when selecting italic in the address state and typing"
  );

  const content = [text];
  // Can still add and remove a style that implies italic.
  for (const style of otherStyles) {
    const { name, item, tag } = style;
    const otherText = name;
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.styleMenu);
    // See Bug 1716840
    // await formatHelper.assertShownStyles(
    //   style,
    //   `Selecting ${name} in address state`
    // );
    await formatHelper.typeInMessage(otherText);
    await formatHelper.assertShownStyles(
      style,
      `Selecting ${name} in address state and typing`
    );
    // Deselect.
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.styleMenu);
    // See Bug 1716840
    // await formatHelper.assertShownStyles(
    //   "italic",
    //   `UnSelecting ${name} in address state`
    // );

    const moreText = "more";
    await formatHelper.typeInMessage(moreText);
    await formatHelper.assertShownStyles(
      "italic",
      `UnSelecting ${name} in address state and typing`
    );

    content.push({ text: otherText, tags: [tag] });
    content.push(moreText);
    formatHelper.assertMessageBodyContent(
      [{ block, content }],
      `${name} region in address state`
    );
  }

  // Change to paragraph.
  await formatHelper.selectParagraphState("p");
  await formatHelper.assertShownStyles(
    null,
    "Lose italic when switching to Paragraph from address state"
  );
  formatHelper.assertMessageBodyContent(
    [{ block: "P", content }],
    "Paragraph block"
  );

  // NOTE: Switching from "p" state to a heading state will *not* remove the
  // italic tags.

  await close_compose_window(win);
});

add_task(async function test_preformat_implies_fixed_width() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  formatHelper.focusMessage();

  const ttItem = formatHelper.getStyleMenuItem("tt");

  const otherStyles = Array.from(formatHelper.styleDataMap.values()).filter(
    data => data.implies?.name === "tt" || data.linked?.name === "tt"
  );

  async function assertFontAndStyle(font, style, message) {
    await formatHelper.assertShownFont(
      font,
      `${message}: Font family "${font}" is shown`
    );
    await formatHelper.assertShownStyles(
      style,
      `${message}: ${style} is shown`
    );
  }

  const block = "PRE";
  let text = "some text";

  await formatHelper.selectParagraphState("pre");
  await assertFontAndStyle(
    "monospace",
    "tt",
    "Fixed width on change to preformat state"
  );
  await formatHelper.typeInMessage(text);
  await assertFontAndStyle(
    "monospace",
    "tt",
    "Fixed width when typing in preformat state"
  );
  formatHelper.assertMessageBodyContent(
    [{ block, content: [text] }],
    "Preformat state, without any explicit styling"
  );

  // Try to change the font to Variable Width.
  await formatHelper.selectFont("");
  // See Bug 1718534
  // await assertFontAndStyle(
  //   "monospace",
  //   "tt",
  //   "Still fixed width when selecting Variable Width font"
  // );
  text += "b";
  await formatHelper.typeInMessage("b");
  formatHelper.assertMessageBodyContent(
    [{ block, content: [text] }],
    "Preformat state, without style change, after unselecting font"
  );
  await assertFontAndStyle(
    "monospace",
    "tt",
    "Still fixed width when selecting Variable Width font and typing"
  );

  const content = [text];
  // Can still set other fonts.
  const font = "Helvetica, Arial, sans-serif";
  await formatHelper.selectFont(font);
  // See Bug 1716840 (comment 3).
  // await assertFontAndStyle(
  //   font,
  //   null,
  //   `Selecting font "${font}" in preformat state`
  // );
  let fontText = "some font text";
  await formatHelper.typeInMessage(fontText);
  content.push({ text: fontText, font });
  await assertFontAndStyle(
    font,
    null,
    `Selecting font "${font}" in preformat state and typing`
  );
  // Deselect.
  // See Bug 1718563 for why we need to select Variable Width instead of Fixed
  // Width.
  // await formatHelper.selectFont("monospace");
  await formatHelper.selectFont("");
  // See Bug 1718534
  // await assertFontAndStyle(
  //   "monospace",
  //   "tt",
  //   `UnSelecting font "${font}" in preformat state`
  // );

  fontText = "no more font";
  await formatHelper.typeInMessage(fontText);
  content.push(fontText);
  await assertFontAndStyle(
    "monospace",
    "tt",
    `UnSelecting font "${font}" in preformat state and typing`
  );

  formatHelper.assertMessageBodyContent(
    [{ block, content }],
    `"${font}" region in preformat state`
  );

  // Trying to undo tt does nothing.
  await formatHelper.selectFromFormatSubMenu(ttItem, formatHelper.styleMenu);
  await assertFontAndStyle(
    "monospace",
    "tt",
    "Still fixed width when selecting Fixed Width style"
  );
  await formatHelper.typeInMessage("a");
  content[content.length - 1] += "a";
  await assertFontAndStyle(
    "monospace",
    "tt",
    "Still fixed width when selecting Fixed Width style and typing"
  );

  formatHelper.assertMessageBodyContent(
    [{ block, content }],
    "Preformat state, without style change, after selecting tt"
  );

  // Can still add and remove a style that implies tt.
  for (const style of otherStyles) {
    const { name, item, tag } = style;
    const otherText = name;
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.styleMenu);
    // See Bug 1716840
    // await assertFontAndStyle(
    //   "monospace",
    //   name,
    //   `Selecting ${name} in preformat state`
    // );
    await formatHelper.typeInMessage(otherText);
    await assertFontAndStyle(
      "monospace",
      name,
      `Selecting ${name} in preformat state and typing`
    );
    // Deselect.
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.styleMenu);
    // See Bug 1716840
    // await assertFontAndStyle(
    //   "monospace",
    //   "tt",
    //   `UnSelecting ${name} in preformat state`
    // );

    const moreText = "more";
    await formatHelper.typeInMessage(moreText);
    await assertFontAndStyle(
      "monospace",
      "tt",
      `UnSelecting ${name} in preformat state and typing`
    );

    content.push({ text: otherText, tags: [tag] });
    content.push(moreText);
    formatHelper.assertMessageBodyContent(
      [{ block, content }],
      `${name} region in preformat state`
    );
  }

  // Change to paragraph.
  await formatHelper.selectParagraphState("p");
  await assertFontAndStyle(
    "",
    null,
    "Lose fixed width when switching to Paragraph from preformat state"
  );
  formatHelper.assertMessageBodyContent(
    [{ block: "P", content }],
    "Paragraph block"
  );

  // NOTE: Switching from "p" state to a heading state will *not* remove the
  // monospace font.

  await close_compose_window(win);
});

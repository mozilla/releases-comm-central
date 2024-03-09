/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test font size in messages.
 */

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );

add_task(async function test_font_size() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const NO_SIZE = formatHelper.NO_SIZE;
  const MIN_SIZE = formatHelper.MIN_SIZE;
  const MAX_SIZE = formatHelper.MAX_SIZE;

  // Before focus, disabled.
  Assert.ok(
    formatHelper.sizeSelector.disabled,
    "Selector should be disabled with no focus"
  );

  formatHelper.focusMessage();
  Assert.ok(
    !formatHelper.sizeSelector.disabled,
    "Selector should be enabled with focus"
  );

  const firstText = "no size";
  const secondText = "with size";

  for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
    if (size === NO_SIZE) {
      continue;
    }
    await formatHelper.assertShownSize(NO_SIZE, `No size at start (${size})`);

    await formatHelper.typeInMessage(firstText);
    formatHelper.assertMessageParagraph(
      [firstText],
      `No size at start after typing (${size})`
    );

    // Select through toolbar.
    await formatHelper.selectSize(size);
    await formatHelper.assertShownSize(size, `Changed to size ${size}`);

    await formatHelper.typeInMessage(secondText);
    await formatHelper.assertShownSize(size, `Still size ${size} when typing`);
    formatHelper.assertMessageParagraph(
      [firstText, { text: secondText, size }],
      `size ${size} on second half`
    );

    // Test text selections.
    for (const [start, end, forward, expect] of [
      // Make sure we expect changes, so the test does not capture the previous
      // state.
      [0, null, true, NO_SIZE], // At start.
      [firstText.length + 1, null, true, size], // In the size region.
      // See Bug 1718227
      // [0, firstText.length + secondText.length, true, null], // Mixed.
      [firstText.length, null, true, NO_SIZE], // On boundary travelling forward.
      [firstText.length, null, false, size], // On boundary travelling backward.
    ]) {
      await formatHelper.selectTextRange(start, end, forward);
      await formatHelper.assertShownSize(
        expect,
        `Selecting text with size ${size}, from ${start} to ${end} ` +
          `${forward ? "forwards" : "backwards"}`
      );
    }

    // Select mixed.
    await formatHelper.selectTextRange(3, firstText.length + 1);
    // See Bug 1718227
    // await formatHelper.assertShownSize(null, `Mixed selection (${size})`);

    // Select through Format menu.
    const item = formatHelper.getSizeMenuItem(size);
    await formatHelper.selectFromFormatSubMenu(item, formatHelper.sizeMenu);
    await formatHelper.assertShownSize(size, `size ${size} on more`);
    formatHelper.assertMessageParagraph(
      [firstText.slice(0, 3), { text: firstText.slice(3) + secondText, size }],
      `size ${size} on more`
    );

    await formatHelper.selectSize(NO_SIZE);
    await formatHelper.assertShownSize(NO_SIZE, `Cleared some size ${size}`);
    formatHelper.assertMessageParagraph(
      [firstText + secondText.slice(0, 1), { text: secondText.slice(1), size }],
      `Cleared some size ${size}`
    );

    await formatHelper.emptyParagraph();
  }

  await close_compose_window(win);
});

add_task(async function test_font_size_increment() {
  const win = await open_compose_new_mail();
  const formatHelper = new FormatHelper(win);

  const NO_SIZE = formatHelper.NO_SIZE;
  const MIN_SIZE = formatHelper.MIN_SIZE;
  const MAX_SIZE = formatHelper.MAX_SIZE;

  // NOTE: size=3 corresponds to no set size
  const increaseButton = formatHelper.increaseSizeButton;
  const decreaseButton = formatHelper.decreaseSizeButton;
  const increaseItem = formatHelper.increaseSizeMenuItem;
  const decreaseItem = formatHelper.decreaseSizeMenuItem;

  Assert.ok(
    increaseButton.disabled,
    "Increase button should be disabled with no focus"
  );
  Assert.ok(
    decreaseButton.disabled,
    "Decrease button should be disabled with no focus"
  );

  formatHelper.focusMessage();

  Assert.ok(
    !increaseButton.disabled,
    "Increase button should be enabled with focus"
  );
  Assert.ok(
    !decreaseButton.disabled,
    "Decrease button should be enabled with focus"
  );

  async function assertShownAndDisabled(formatHelper, size, message) {
    await formatHelper.assertShownSize(size, message);
    switch (size) {
      case MAX_SIZE:
        Assert.ok(
          increaseButton.disabled,
          `${message}: Increase button should be disabled at max size ${size}`
        );
        Assert.ok(
          !decreaseButton.disabled,
          `${message}: Decrease button should be enabled at max size ${size}`
        );
        await formatHelper.assertWithFormatSubMenu(
          formatHelper.sizeMenu,
          () => increaseItem.disabled && !decreaseItem.disabled,
          `Only the increase menu item should be disabled at max size ${size}`
        );
        break;
      case MIN_SIZE:
        Assert.ok(
          !increaseButton.disabled,
          `${message}: Increase button should be enabled at min size ${size}`
        );
        Assert.ok(
          decreaseButton.disabled,
          `${message}: Decrease button should be disabled at min size ${size}`
        );
        await formatHelper.assertWithFormatSubMenu(
          formatHelper.sizeMenu,
          () => !increaseItem.disabled && decreaseItem.disabled,
          `Only the decrease menu item should be disabled at min size ${size}`
        );
        break;
      default:
        Assert.ok(
          !increaseButton.disabled,
          `${message}: Increase button should be enabled at size ${size}`
        );
        Assert.ok(
          !decreaseButton.disabled,
          `${message}: Decrease button should be enabled at size ${size}`
        );
        await formatHelper.assertWithFormatSubMenu(
          formatHelper.sizeMenu,
          () => !increaseItem.disabled && !decreaseItem.disabled,
          `No menu items should be disabled at size ${size}`
        );
        break;
    }
  }

  async function assertAndType(formatHelper, size, text, content, message) {
    await assertShownAndDisabled(
      formatHelper,
      size,
      `${message}: At size ${size}`
    );

    await formatHelper.typeInMessage(text);
    await assertShownAndDisabled(
      formatHelper,
      size,
      `${message}: At size ${size} and typing`
    );

    content.push({ text, size });
    formatHelper.assertMessageParagraph(
      content,
      `${message}: Added size ${size}`
    );
  }

  const content = [];
  let size = NO_SIZE;

  let text = "start";
  await formatHelper.typeInMessage(text);
  content.push(text);
  formatHelper.assertMessageParagraph(content, "Start with no font");

  await assertShownAndDisabled(formatHelper, size, "At start");

  for (size++; size <= MAX_SIZE; size++) {
    increaseButton.click();
    await assertAndType(
      formatHelper,
      size,
      `step up to ${size}`,
      content,
      `Increase step with button`
    );
  }

  // Reverse direction.
  for (size = MAX_SIZE - 1; size > NO_SIZE; size--) {
    decreaseButton.click();
    await assertAndType(
      formatHelper,
      size,
      `step down to ${size}`,
      content,
      `Decrease step with button`
    );
  }

  decreaseButton.click();
  text = "middle";
  await formatHelper.typeInMessage(text);
  content.push(text);
  await assertShownAndDisabled(formatHelper, size, "At middle");

  for (size--; size >= MIN_SIZE; size--) {
    // Use menu item.
    await formatHelper.selectFromFormatSubMenu(
      decreaseItem,
      formatHelper.sizeMenu
    );
    await assertAndType(
      formatHelper,
      size,
      `step down to ${size}`,
      content,
      `Decrease step with menu item`
    );
  }

  for (size = MIN_SIZE + 1; size < NO_SIZE; size++) {
    // Use menu item.
    await formatHelper.selectFromFormatSubMenu(
      increaseItem,
      formatHelper.sizeMenu
    );
    await assertAndType(
      formatHelper,
      size,
      `step up to ${size}`,
      content,
      `Increase step with menu item`
    );
  }

  await formatHelper.emptyParagraph();

  // Selecting max or min sizes directly also enables or disables the
  // increase/decrease buttons and items.
  await formatHelper.selectSize(MAX_SIZE);
  await assertShownAndDisabled(formatHelper, MAX_SIZE, "Direct to max size");
  await formatHelper.selectSize(NO_SIZE);
  await assertShownAndDisabled(formatHelper, NO_SIZE, "Direct to no size");
  await formatHelper.selectSize(MIN_SIZE);
  await assertShownAndDisabled(formatHelper, MIN_SIZE, "Direct to min size");

  // Type at min size.
  text = "text to select";
  await formatHelper.typeInMessage(text);
  formatHelper.assertMessageParagraph([{ text, size: MIN_SIZE }], "Min text");
  // Select all.
  await formatHelper.selectTextRange(0, text.length);

  for (size = MIN_SIZE + 1; size <= MAX_SIZE; size++) {
    increaseButton.click();
    await assertShownAndDisabled(
      formatHelper,
      size,
      `Increase selection to size ${size}`
    );
    if (size === NO_SIZE) {
      formatHelper.assertMessageParagraph([text], "Increase to middle size");
    } else {
      formatHelper.assertMessageParagraph(
        [{ text, size }],
        `Increase to size ${size}`
      );
    }
  }

  // Reverse
  for (size = MAX_SIZE - 1; size >= MIN_SIZE; size--) {
    decreaseButton.click();
    await assertShownAndDisabled(
      formatHelper,
      size,
      `Decrease selection to size ${size}`
    );
    if (size === NO_SIZE) {
      formatHelper.assertMessageParagraph([text], "Decrease to middle size");
    } else {
      formatHelper.assertMessageParagraph(
        [{ text, size }],
        `Decrease to size ${size}`
      );
    }
  }

  await close_compose_window(win);
});

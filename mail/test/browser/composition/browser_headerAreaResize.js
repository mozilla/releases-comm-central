/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_task(async function test_tabBetweenSubjectAndBody() {
  const identity = MailServices.accounts.defaultAccount.defaultIdentity;
  for (const html of [true, false]) {
    await SpecialPowers.pushPrefEnv({
      set: [[`mail.identity.${identity.key}.compose_html`, html]],
    });
    const win = await open_compose_new_mail();
    registerCleanupFunction(async () => {
      if (!win.closed) {
        await close_compose_window(win);
      }
    });

    const doc = win.document;
    const subject = doc.getElementById("msgSubject");
    const editor = doc.getElementById("messageEditor");
    subject.focus();
    EventUtils.synthesizeKey("KEY_Tab", {}, win);
    Assert.equal(
      doc.activeElement,
      editor,
      `Tab from Subject should focus the editor (HTML: ${html})`
    );
    EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, win);
    Assert.equal(
      doc.activeElement,
      subject,
      `Shift+Tab from the editor should focus Subject (HTML: ${html})`
    );

    EventUtils.synthesizeKey("KEY_F6", {}, win);
    Assert.equal(
      doc.activeElement,
      editor,
      "F6 from Subject should still focus the editor"
    );
    EventUtils.synthesizeKey("KEY_F6", { shiftKey: true }, win);
    Assert.equal(
      doc.activeElement,
      subject,
      "Shift+F6 from the editor should still focus Subject"
    );

    await close_compose_window(win);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_resizeHeaderArea() {
  const win = await open_compose_new_mail();
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await close_compose_window(win);
    }
  });

  const doc = win.document;
  const subject = doc.getElementById("msgSubject");
  const editor = doc.getElementById("messageEditor");
  const headers = doc.getElementById("MsgHeadersToolbar");
  const splitter = doc.getElementById("headersSplitter");
  const resizeItem = doc.getElementById("menu_resizeHeaderArea");
  await doc.l10n.translateElements([splitter]);
  Assert.equal(
    splitter.getAttribute("role"),
    "separator",
    "The header splitter should retain separator semantics"
  );
  Assert.equal(
    doc.l10n.getAttributes(splitter).id,
    "compose-header-area-splitter",
    "The header splitter should have a localized name and resize instructions"
  );
  Assert.deepEqual(
    splitter.ariaControlsElements,
    [headers],
    "The header splitter should identify the region it resizes"
  );
  Assert.equal(
    doc.l10n.getAttributes(resizeItem).id,
    "menuitem-resize-header-area",
    "The View command should have a localized label and access key"
  );
  Assert.ok(
    splitter.ariaLabel && splitter.ariaDescription,
    "The header splitter should expose its name and resize instructions"
  );

  for (const previousFocus of [subject, editor]) {
    if (previousFocus == editor) {
      win.focusMsgBody();
    } else {
      previousFocus.focus();
    }
    resizeItem.doCommand();
    Assert.equal(
      doc.activeElement,
      splitter,
      "The View command should focus the header splitter"
    );
    const style = win.getComputedStyle(splitter);
    Assert.notEqual(
      style.outlineStyle,
      "none",
      "The focused header splitter should have a visible focus outline"
    );
    Assert.greater(
      parseFloat(style.outlineWidth),
      0,
      "The focused header splitter's outline should have a positive width"
    );

    const height = headers.getBoundingClientRect().height;
    for (const [key, options, delta] of [
      ["KEY_ArrowDown", {}, 10],
      ["KEY_ArrowDown", { shiftKey: true }, 60],
      ["KEY_ArrowUp", {}, 50],
      ["KEY_ArrowUp", { shiftKey: true }, 0],
    ]) {
      const resized = BrowserTestUtils.waitForEvent(
        splitter,
        "splitter-resized"
      );
      EventUtils.synthesizeKey(key, options, win);
      await resized;
      Assert.equal(
        headers.getBoundingClientRect().height,
        height + delta,
        "Arrow keys should resize the headers, with larger steps for Shift"
      );
      Assert.equal(
        Number(splitter.getAttribute("aria-valuenow")),
        Math.round(height + delta),
        "The accessible value should reflect the header height"
      );
      Assert.equal(
        splitter.tabIndex,
        -1,
        "Resizing should keep the header splitter out of the tab order"
      );
    }

    EventUtils.synthesizeKey("KEY_Tab", {}, win);
    Assert.equal(
      doc.activeElement,
      editor,
      "Tab should leave the header splitter and focus the editor"
    );
  }

  subject.focus();
  resizeItem.doCommand();
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, win);
  Assert.equal(
    doc.activeElement,
    subject,
    "Shift+Tab should leave the header splitter and focus Subject"
  );
  resizeItem.doCommand();
  resizeItem.doCommand();
  Assert.equal(
    doc.activeElement,
    splitter,
    "Repeated resize commands should keep focus on the splitter"
  );
  await close_compose_window(win);
});

add_task(async function test_mouseResizeWithoutMenu() {
  const win = await open_compose_new_mail();
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await close_compose_window(win);
    }
  });

  const doc = win.document;
  const headers = doc.getElementById("MsgHeadersToolbar");
  const splitter = doc.getElementById("headersSplitter");
  const height = headers.getBoundingClientRect().height;
  const rect = splitter.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const resized = BrowserTestUtils.waitForEvent(splitter, "splitter-resized");
  EventUtils.synthesizeMouseAtCenter(
    splitter,
    { type: "mousedown", buttons: 1 },
    win
  );
  EventUtils.synthesizeMouse(
    doc.documentElement,
    x,
    y + 30,
    { type: "mousemove", buttons: 1 },
    win
  );
  EventUtils.synthesizeMouse(
    doc.documentElement,
    x,
    y + 30,
    { type: "mouseup" },
    win
  );
  await resized;
  Assert.equal(
    headers.getBoundingClientRect().height,
    height + 30,
    "Dragging should resize the headers without invoking the menu command"
  );
  Assert.equal(
    splitter.tabIndex,
    -1,
    "Mouse resizing should keep the splitter out of the tab order"
  );
  await close_compose_window(win);
});

add_task(async function test_resizeHeaderAreaCommand() {
  const win = await open_compose_new_mail();
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await close_compose_window(win);
    }
  });

  const doc = win.document;
  const subject = doc.getElementById("msgSubject");
  const editor = doc.getElementById("messageEditor");
  const headers = doc.getElementById("MsgHeadersToolbar");
  const splitter = doc.getElementById("headersSplitter");
  const viewMenu = doc.getElementById("menu_View");
  const popup = doc.getElementById("menu_View_Popup");
  const resizeItem = doc.getElementById("menu_resizeHeaderArea");
  const menuItems = Array.from(popup.children).filter(item =>
    item.matches("menu, menuitem")
  );
  await doc.l10n.translateElements(
    menuItems.filter(item => doc.l10n.getAttributes(item).id)
  );
  const resizeAccessKey = resizeItem.getAttribute("accesskey")?.toLowerCase();
  Assert.ok(resizeAccessKey, "The resize command should have an access key");
  Assert.deepEqual(
    menuItems.filter(
      item => item.getAttribute("accesskey")?.toLowerCase() == resizeAccessKey
    ),
    [resizeItem],
    `The resize access key (${resizeAccessKey}) should be unique in the View menu`
  );
  if (AppConstants.platform != "macosx") {
    // Exclude the existing Toolbars/To Field access key conflict from this test.
    doc
      .getElementById("menu_showToField")
      .setAttribute("intended-duplicate-accesskey", "true");
  }

  win.focusMsgBody();
  win.GetCurrentEditor().insertText("Resize from the View menu");
  const selection = win.GetCurrentEditor().selection;
  selection.collapse(selection.anchorNode, 3);
  const bodyContent = editor.contentDocument.body.innerHTML;

  for (const previousFocus of [subject, editor]) {
    for (const shiftKey of [false, true]) {
      if (previousFocus == editor) {
        win.focusMsgBody();
      } else {
        subject.focus();
      }
      const anchorNode = selection.anchorNode;
      const anchorOffset = selection.anchorOffset;
      const initialHeight = headers.getBoundingClientRect().height;

      if (AppConstants.platform == "macosx") {
        // Native macOS menus do not support Alt access keys.
        resizeItem.doCommand();
      } else {
        const shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
        EventUtils.synthesizeKey(
          viewMenu.getAttribute("accesskey"),
          { altKey: true },
          win
        );
        await shown;
        const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
        EventUtils.synthesizeKey(resizeAccessKey, {}, win);
        await hidden;
        // Let queued menu dismissal finish before checking the splitter's focus.
        await new Promise(resolve => win.requestAnimationFrame(resolve));
      }
      Assert.equal(
        doc.activeElement,
        splitter,
        "The resize command should keep focus on the splitter after activation"
      );
      EventUtils.synthesizeKey("KEY_ArrowDown", {}, win);
      EventUtils.synthesizeKey("KEY_Tab", { shiftKey }, win);
      Assert.equal(
        doc.activeElement,
        shiftKey ? subject : editor,
        "Tab or Shift+Tab should return to composing after using the menu"
      );
      Assert.greater(
        headers.getBoundingClientRect().height,
        initialHeight,
        "Leaving the splitter should keep the new height"
      );
      Assert.equal(
        editor.contentDocument.body.innerHTML,
        bodyContent,
        "The resize command should leave the message body unchanged"
      );
      if (previousFocus == editor) {
        Assert.equal(
          selection.anchorNode,
          anchorNode,
          "Leaving the splitter should preserve the editor caret node"
        );
        Assert.equal(
          selection.anchorOffset,
          anchorOffset,
          "Leaving the splitter should preserve the editor caret offset"
        );
      }
    }
  }
  await close_compose_window(win);
});

add_task(async function test_resizeWithoutCompletionKeys() {
  const win = await open_compose_new_mail();
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await close_compose_window(win);
    }
  });

  const doc = win.document;
  const subject = doc.getElementById("msgSubject");
  const editor = doc.getElementById("messageEditor");
  const headers = doc.getElementById("MsgHeadersToolbar");
  const splitter = doc.getElementById("headersSplitter");
  win.focusMsgBody();
  win.GetCurrentEditor().insertText("Header resize test");
  const bodyContent = editor.contentDocument.body.innerHTML;
  subject.focus();
  win.goDoCommand("cmd_resizeHeaderArea");
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, win);
  const height = headers.getBoundingClientRect().height;

  for (const key of ["KEY_Enter", "KEY_Escape"]) {
    EventUtils.synthesizeKey(key, {}, win);
    Assert.equal(
      doc.activeElement,
      splitter,
      `${key} should leave focus on the splitter`
    );
    Assert.equal(
      headers.getBoundingClientRect().height,
      height,
      `${key} should leave the resized height unchanged`
    );
    Assert.equal(
      editor.contentDocument.body.innerHTML,
      bodyContent,
      `${key} should leave the message body unchanged`
    );
    Assert.equal(subject.value, "", `${key} should leave Subject unchanged`);
  }
  await close_compose_window(win);
});

add_task(async function test_resizeOnFocusDeparture() {
  const win = await open_compose_new_mail();
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await close_compose_window(win);
    }
  });

  const doc = win.document;
  const subject = doc.getElementById("msgSubject");
  const editor = doc.getElementById("messageEditor");
  const headers = doc.getElementById("MsgHeadersToolbar");
  const splitter = doc.getElementById("headersSplitter");
  const resizeItem = doc.getElementById("menu_resizeHeaderArea");
  for (const departure of ["Tab", "Shift+Tab", "click"]) {
    win.focusMsgBody();
    resizeItem.doCommand();
    const resized = BrowserTestUtils.waitForEvent(splitter, "splitter-resized");
    EventUtils.synthesizeKey("KEY_ArrowDown", { type: "keydown" }, win);
    const height = headers.getBoundingClientRect().height;
    if (departure == "click") {
      EventUtils.synthesizeMouseAtCenter(subject, {}, win);
    } else {
      EventUtils.synthesizeKey(
        "KEY_Tab",
        { shiftKey: departure == "Shift+Tab" },
        win
      );
    }
    Assert.equal(
      doc.activeElement,
      departure == "Tab" ? editor : subject,
      `${departure} should move focus normally after resizing`
    );
    Assert.equal(
      headers.getBoundingClientRect().height,
      height,
      "Leaving the splitter should keep its size"
    );

    await resized;
    EventUtils.synthesizeKey("KEY_ArrowDown", { type: "keyup" }, win);
    Assert.equal(
      splitter.tabIndex,
      -1,
      "Leaving the splitter should keep it out of the tab order"
    );
  }

  win.gWindowLocked = true;
  win.updateViewItems();
  Assert.ok(
    doc.getElementById("cmd_resizeHeaderArea").hasAttribute("disabled"),
    "The resize command should be disabled while composing is locked"
  );
  win.goDoCommand("cmd_resizeHeaderArea");
  Assert.equal(
    doc.activeElement,
    subject,
    "A disabled resize command should leave focus unchanged"
  );
  win.gWindowLocked = false;
  win.updateViewItems();

  await close_compose_window(win);
});

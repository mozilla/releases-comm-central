/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test indent/outdent in message compose.
 */

var { close_compose_window, open_compose_new_mail, FormatHelper } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_task(async function test_indent_outdent() {
  const win = await open_compose_new_mail();

  const formatHelper = new FormatHelper(win);
  formatHelper.focusMessage();

  await formatHelper.typeInMessage("testing indent");
  await formatHelper.selectFirstParagraph();

  Assert.ok(
    !formatHelper.messageDocument.querySelector("blockquote"),
    "should start with no indent"
  );

  // Indent.
  EventUtils.synthesizeMouseAtCenter(
    win.document.getElementById("indentButton"),
    {},
    win
  );
  await TestUtils.waitForTick();
  Assert.ok(
    formatHelper.messageDocument.querySelector("blockquote p"),
    "should have indented the paragraph"
  );

  // Indent once more.
  EventUtils.synthesizeMouseAtCenter(
    win.document.getElementById("indentButton"),
    {},
    win
  );
  await TestUtils.waitForTick();
  Assert.ok(
    formatHelper.messageDocument.querySelector("blockquote blockquote p"),
    "should have double indented the paragraph"
  );

  // Outdent.
  EventUtils.synthesizeMouseAtCenter(
    win.document.getElementById("outdentButton"),
    {},
    win
  );
  await TestUtils.waitForTick();
  Assert.ok(
    formatHelper.messageDocument.querySelector("blockquote p"),
    "should have outdented the paragraph"
  );

  // Outdent.
  EventUtils.synthesizeMouseAtCenter(
    win.document.getElementById("outdentButton"),
    {},
    win
  );
  await TestUtils.waitForTick();
  Assert.ok(
    !formatHelper.messageDocument.querySelector("blockquote"),
    "should have outdented back to start"
  );

  await close_compose_window(win);
});

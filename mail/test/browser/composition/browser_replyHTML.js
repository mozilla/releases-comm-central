/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that replying to an HTML message works properly.
 */

var { close_compose_window, open_compose_with_reply } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

add_task(async function testReplyWholeMessage() {
  const file = new FileUtils.File(getTestFilePath("data/sampleContent.eml"));
  const msgc = await open_message_from_file(file);

  const cwc = await open_compose_with_reply(msgc);
  const blockquote = cwc.document
    .getElementById("messageEditor")
    .contentDocument.body.querySelector("blockquote");

  const paragraphs = blockquote.querySelectorAll("blockquote > p");
  Assert.equal(paragraphs.length, 4);
  Assert.deepEqual(
    Array.from(paragraphs, p => p.textContent),
    [
      "This is a page of sample content for tests.",
      "Link to a web page",
      "Link to an email address",
      "",
    ],
    "message text should be quoted correctly"
  );
  await close_compose_window(cwc);

  await BrowserTestUtils.closeWindow(msgc);
});

add_task(async function testReplySelection() {
  const file = new FileUtils.File(getTestFilePath("data/sampleContent.eml"));
  const msgc = await open_message_from_file(file);

  const aboutMessage = get_about_message(msgc);
  const win = aboutMessage.document.getElementById("messagepane").contentWindow;
  const doc =
    aboutMessage.document.getElementById("messagepane").contentDocument;
  const selection = win.getSelection();

  const text = doc.querySelector("body > div.moz-text-html > p");

  const range = doc.createRange();
  range.setStart(text.firstChild, 18);
  range.setEnd(text.firstChild, 32);

  selection.removeAllRanges();
  selection.addRange(range);

  const cwc = await open_compose_with_reply(msgc);
  const blockquote = cwc.document
    .getElementById("messageEditor")
    .contentDocument.body.querySelector("blockquote");

  Assert.equal(
    blockquote.textContent,
    "sample content",
    "selected text should be quoted correctly"
  );
  await close_compose_window(cwc);

  await BrowserTestUtils.closeWindow(msgc);
});

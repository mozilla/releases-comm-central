/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that opening an .eml file the body of the message is correct,
 * that it hasn't been UTF-8 mojibake'd.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

async function extract_eml_body_textcontent(eml) {
  const file = new FileUtils.File(getTestFilePath(`data/${eml}`));
  const msgc = await open_message_from_file(file);

  // Be sure to view message body as Original HTML
  msgc.MsgBodyAllowHTML();
  const textContent = msgc.content.document.documentElement.textContent;

  await BrowserTestUtils.closeWindow(msgc);
  return textContent;
}

/**
 * Checks that the text content is equal for the .eml files.
 */
async function check_eml_textcontent(eml) {
  const textContent = await extract_eml_body_textcontent(eml);
  Assert.stringContains(textContent, "árvíztűrő tükörfúrógép");
  Assert.stringContains(textContent, "ÁRVÍZTŰRŐ TÜKÖRFÚRÓGÉP");
}

/**
 * This test exercises the bug for reversed http-equiv, content order:
 *  <head>
 *    <meta content="text/html; charset=ISO-8859-2"; http-equiv="content-type">
 *  </head>
 */
add_task(
  async function test_original_html_characters_head_meta_content_charset_httpEq() {
    await check_eml_textcontent("./bug594646_reversed_order_8bit.eml");
    await check_eml_textcontent("./bug594646_reversed_order_qp.eml");
    await check_eml_textcontent("./bug594646_reversed_order_b64.eml");
  }
);

/**
 * This test exercises the bug for newline delimited charset:
 *  <head>
 *    <meta http-equiv="content-type" content="text/html;
 *          charset=ISO-8859-2">
 *  </head>
 */
add_task(
  async function test_original_html_characters_head_meta_httpEq_content_newline_charset() {
    await check_eml_textcontent("./bug594646_newline_charset_8bit.eml");
    await check_eml_textcontent("./bug594646_newline_charset_qp.eml");
    await check_eml_textcontent("./bug594646_newline_charset_b64.eml");
  }
);

/**
 * This test exercises the bug for newline delimited and reverse ordered http-equiv:
 *  <head>
 *    <meta content="text/html; charset=ISO-8859-2"
 *          http-equiv="content-type">
 *  </head>
 */
add_task(
  async function test_original_html_characters_head_meta_content_charset_newline_httpEq() {
    await check_eml_textcontent("./bug594646_newline_httpequiv_8bit.eml");
    await check_eml_textcontent("./bug594646_newline_httpequiv_qp.eml");
    await check_eml_textcontent("./bug594646_newline_httpequiv_b64.eml");
  }
);

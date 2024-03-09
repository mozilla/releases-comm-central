/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests related to message body.
 */

var { get_msg_source, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var {
  be_in_folder,
  get_special_folder,
  get_about_message,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var gOutboxFolder;

add_setup(async function () {
  gOutboxFolder = await get_special_folder(Ci.nsMsgFolderFlags.Queue);
});

/**
 * Tests that sending link with invalid data uri works.
 */
add_task(async function test_invalid_data_uri() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "someone@example.com",
    "Test sending link with invalid data uri",
    ""
  );

  cwc.GetCurrentEditor().insertHTML("<a href=data:1>invalid data uri</a>");
  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  cwc.goDoCommand("cmd_sendLater");
  await closePromise;

  await be_in_folder(gOutboxFolder);
  const msgLoaded = BrowserTestUtils.waitForEvent(
    get_about_message(),
    "MsgLoaded"
  );
  const outMsg = await select_click_row(0);
  await msgLoaded;
  const outMsgContent = await get_msg_source(outMsg);

  ok(
    outMsgContent.includes("invalid data uri"),
    "message containing invalid data uri should be sent"
  );

  await press_delete(); // Delete the msg from Outbox.
});

/**
 * Tests that when converting <a href="$1">$2</a> to text/plain, if $1 matches
 * with $2, $1 should be discarded to prevent duplicated links.
 */
add_task(async function test_freeTextLink() {
  const prevSendFormat = Services.prefs.getIntPref("mail.default_send_format");
  Services.prefs.setIntPref(
    "mail.default_send_format",
    Ci.nsIMsgCompSendFormat.PlainText
  );
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "someone@example.com",
    "Test free text link",
    ""
  );

  const link1 = "https://example.com";
  const link2 = "name@example.com";
  const link3 = "https://example.net";
  cwc
    .GetCurrentEditor()
    .insertHTML(
      `<a href="${link1}/">${link1}</a> <a href="mailto:${link2}">${link2}</a> <a href="${link3}">link3</a>`
    );
  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  cwc.goDoCommand("cmd_sendLater");
  await closePromise;

  await be_in_folder(gOutboxFolder);
  const msgLoaded = BrowserTestUtils.waitForEvent(
    get_about_message(),
    "MsgLoaded"
  );
  const outMsg = await select_click_row(0);
  await msgLoaded;
  const outMsgContent = await get_msg_source(outMsg);

  Assert.equal(
    getMessageBody(outMsgContent),
    `${link1} ${link2} link3 <${link3}>\r\n`,
    "Links should be correctly converted to plain text"
  );

  await press_delete(); // Delete the msg from Outbox.

  Services.prefs.setIntPref("mail.default_send_format", prevSendFormat);
});

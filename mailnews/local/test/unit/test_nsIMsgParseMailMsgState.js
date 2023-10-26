/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var MSG_LINEBREAK = "\r\n";

add_task(async function run_the_test() {
  localAccountUtils.loadLocalMailAccount();

  await test_parse_headers_without_crash("./data/mailformed_recipients.eml");
  await test_parse_headers_without_crash("./data/mailformed_subject.eml");
  await test_parse_headers_without_crash("./data/invalid_mozilla_keys.eml");
});

async function test_parse_headers_without_crash(eml) {
  const file = do_get_file(eml);

  const parser = Cc[
    "@mozilla.org/messenger/messagestateparser;1"
  ].createInstance(Ci.nsIMsgParseMailMsgState);

  parser.SetMailDB(localAccountUtils.inboxFolder.getDatabaseWOReparse());
  parser.state = Ci.nsIMsgParseMailMsgState.ParseHeadersState;

  const bytes = await IOUtils.read(file.path);
  const mailData = new TextDecoder().decode(bytes);
  const lines = mailData.split(MSG_LINEBREAK);

  for (let line = 0; line < lines.length; line++) {
    parser.ParseAFolderLine(
      lines[line] + MSG_LINEBREAK,
      lines[line].length + 2
    );
  }
  // Apparently getDatabaseWOReparse doesn't like being called too often
  // in a row.
  await PromiseTestUtils.promiseDelay(200);
}

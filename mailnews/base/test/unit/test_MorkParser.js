/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Tests that we can read Mork (.msf) data. */

var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
var { MorkParser } = ChromeUtils.importESModule(
  "resource:///modules/MorkParser.sys.mjs"
);

add_task(async function testReadMSF() {
  const path = do_get_file("../../../data/love.msf").path;
  const msfData = await IOUtils.read(path);
  const msf = MailStringUtils.uint8ArrayToByteString(msfData);
  const parsed = new MorkParser().parseContent(msf);

  // Do a couple basic checks that parsing seemed ok.
  Assert.ok(Array.isArray(parsed), "should get array data");
  Assert.equal(
    parsed[0]["message-id"],
    "fe06cac4-18ed-43aa-98a9-ee358e82b368@example.com"
  );
});

add_task(async function testReadMSFWithJSON() {
  const path = do_get_file("../../../data/withjson.msf").path;
  const msfData = await IOUtils.read(path);
  const msf = MailStringUtils.uint8ArrayToByteString(msfData);
  const parsed = new MorkParser().parseContent(msf);

  // Do a couple basic checks that parsing seemed ok.
  Assert.ok(Array.isArray(parsed), "should get array data");
  Assert.equal(JSON.parse(parsed[0].columnStates).selectCol.visible, false);
  Assert.equal(parsed[1]["message-id"], "ex.sqlite@example");
});

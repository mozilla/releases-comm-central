/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests importing .emlx files from Apple Mail, including malformed ones.
 */

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

const MESSAGE =
  "From: alice@example.com\nTo: bob@example.com\nSubject: Hello\n\nHi Bob!\n";
const PLIST =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
  '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
  '<plist version="1.0"><dict><key>flags</key><integer>1</integer></dict></plist>\n';

const MAILBOXES = {
  Valid: `${MESSAGE.length}\n${MESSAGE}${PLIST}`,
  Negative: `-5\n${MESSAGE}${PLIST}`,
  NegativeJunk: `-1x\n${MESSAGE}${PLIST}`,
  Zero: `0\n${MESSAGE}${PLIST}`,
  NoNumber: `${MESSAGE}${PLIST}`,
  Over32Bits: `9999999999\n${MESSAGE}${PLIST}`,
  Uint32Max: `4294967295\n${MESSAGE}${PLIST}`,
  TooLong: `${MESSAGE.length + 1}\n${MESSAGE}`,
  OnlyDigits: "12345",
  OnlyLength: "5\n",
  OnlyNegative: "-5\n",
  OnlyNegativeJunk: "-1X",
  OnlyOver32Bits: "9999999999X",
  Empty: "",
};

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();

  const mailDir = PathUtils.join(PathUtils.profileDir, "AppleMail");
  for (const [name, content] of Object.entries(MAILBOXES)) {
    const messagesDir = PathUtils.join(
      mailDir,
      "Mailboxes",
      `${name}.mbox`,
      "Messages"
    );
    await IOUtils.makeDirectory(messagesDir);
    await IOUtils.writeUTF8(PathUtils.join(messagesDir, "1.emlx"), content);
  }

  const importMail = Cc[
    "@mozilla.org/import/import-appleMailImpl;1"
  ].createInstance(Ci.nsIImportMail);
  const boxes = importMail.findMailboxes(await IOUtils.getFile(mailDir));
  Assert.equal(
    boxes.length,
    Object.keys(MAILBOXES).length,
    "all mailboxes should be found"
  );

  for (const box of boxes) {
    const name = box.GetDisplayName();
    const folder = localAccountUtils.rootFolder.createLocalSubfolder(name);
    importMail.ImportMailbox(box, folder, {}, {}, {});
  }
});

add_task(async function test_validEmlx() {
  const folder = localAccountUtils.rootFolder.getChildNamed("Valid");
  const content = await IOUtils.readUTF8(folder.filePath.path);
  Assert.stringContains(
    content,
    "X-Mozilla-Status: 0001",
    "read flag should be imported"
  );
  Assert.stringContains(content, MESSAGE, "message should be imported");
  Assert.ok(!content.includes("<plist"), "metadata should not be imported");
});

add_task(async function test_malformedEmlx() {
  for (const name of Object.keys(MAILBOXES)) {
    if (name == "Valid") {
      continue;
    }
    const folder = localAccountUtils.rootFolder.getChildNamed(name);
    const path = folder.filePath.path;
    const content = (await IOUtils.exists(path))
      ? await IOUtils.readUTF8(path)
      : "";
    Assert.equal(content, "", `${name} should not import anything`);
  }
});

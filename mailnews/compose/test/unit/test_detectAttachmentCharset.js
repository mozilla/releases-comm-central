/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for auto-detecting attachment file charset.
 */

function checkAttachmentCharset(expectedCharset) {
  const msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  const attachmentData = getAttachmentFromContent(msgData);

  Assert.equal(expectedCharset, getContentCharset(attachmentData));
}

function getContentCharset(aContent) {
  const found = aContent.match(/^Content-Type: text\/plain; charset=(.*?);/);
  if (found) {
    Assert.equal(found.length, 2);
    return found[1];
  }
  return null;
}

async function testUTF8() {
  await createMessage(do_get_file("data/test-UTF-8.txt"));
  checkAttachmentCharset("UTF-8");
}

async function testUTF16BE() {
  await createMessage(do_get_file("data/test-UTF-16BE.txt"));
  checkAttachmentCharset("UTF-16BE");
}

async function testUTF16LE() {
  await createMessage(do_get_file("data/test-UTF-16LE.txt"));
  checkAttachmentCharset("UTF-16LE");
}

async function testShiftJIS() {
  await createMessage(do_get_file("data/test-SHIFT_JIS.txt"));
  checkAttachmentCharset("Shift_JIS");
}

async function testISO2022JP() {
  await createMessage(do_get_file("data/test-ISO-2022-JP.txt"));
  checkAttachmentCharset("ISO-2022-JP");
}

async function testKOI8R() {
  // NOTE: KOI8-R is detected as KOI8-U which is a superset covering both
  // Russian and Ukrainian (a few box-drawing characters are repurposed).
  await createMessage(do_get_file("data/test-KOI8-R.txt"));
  checkAttachmentCharset("KOI8-U");
}

async function testWindows1252() {
  await createMessage(do_get_file("data/test-windows-1252.txt"));
  checkAttachmentCharset("windows-1252");
}

var tests = [
  testUTF8,
  testUTF16BE,
  testUTF16LE,
  testShiftJIS,
  testISO2022JP,
  testKOI8R,
  testWindows1252,
];

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  Services.prefs.setIntPref("mail.strictly_mime.parm_folding", 0);

  tests.forEach(x => add_task(x));
  run_next_test();
}

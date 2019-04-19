/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for auto-detecting attachment file charset.
 */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

function checkAttachmentCharset(expectedCharset) {
  let msgData = mailTestUtils
    .loadMessageToString(gDraftFolder, mailTestUtils.firstMsgHdr(gDraftFolder));
  let attachmentData = getAttachmentFromContent(msgData);

  Assert.equal(expectedCharset, getContentCharset(attachmentData));
}

function getContentCharset(aContent) {
  let found = aContent.match(/^Content-Type: text\/plain; charset=(.*?);/);
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
  Services.prefs.setStringPref("intl.charset.detector", "ja_parallel_state_machine");
  await createMessage(do_get_file("data/test-SHIFT_JIS.txt"));
  checkAttachmentCharset("Shift_JIS");
}

async function testISO2022JP() {
  Services.prefs.setStringPref("intl.charset.detector", "ja_parallel_state_machine");
  await createMessage(do_get_file("data/test-ISO-2022-JP.txt"));
  checkAttachmentCharset("ISO-2022-JP");
}

async function testKOI8R() {
  Services.prefs.setStringPref("intl.charset.detector", "ruprob");
  await createMessage(do_get_file("data/test-KOI8-R.txt"));
  checkAttachmentCharset("KOI8-R");
}

async function testWindows1252() {
  Services.prefs.clearUserPref("intl.charset.detector");
  await createMessage(do_get_file("data/test-windows-1252.txt"));
  checkAttachmentCharset(null);  // windows-1252 is not directly detected.
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

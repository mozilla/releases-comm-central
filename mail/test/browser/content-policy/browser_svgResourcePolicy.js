/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that loads from external resource documents, like an SVG referenced
 * by a CSS filter, are subject to the remote content policy.
 */

"use strict";

var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

const counterURL =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-policy/html/hitcounter.sjs";

var folder;
var gMsgNo = -1;

add_setup(async () => {
  folder = await create_folder("svgResourcePolicy");
  registerCleanupFunction(() => {
    folder.deleteSelf(null);
  });
});

function addToFolder(subject, body) {
  const msgId = Services.uuid.generateUUID() + "@example.com";
  gMsgNo++;
  const source =
    "X-Mozilla-Status: 0001\n" +
    "X-Mozilla-Status2: 00000000\n" +
    `Message-ID: <${msgId}>\n` +
    "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
    "From: Tester <tests@example.com>\n" +
    "MIME-Version: 1.0\n" +
    "To: recipient@example.com\n" +
    `Subject: ${subject}\n` +
    "Content-Type: text/html; charset=UTF-8\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    body +
    "\n";
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.gettingNewMessages = true;
  folder.addMessage(source);
  folder.gettingNewMessages = false;
  return folder.msgDatabase.getMsgHdrForMessageID(msgId);
}

function filterMessageBody(importURL) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<style>@import url("${importURL}");</style>` +
    `<defs><filter id="f"><feFlood flood-color="blue"/></filter></defs>` +
    `<rect width="64" height="64" fill="green"/></svg>`;
  const filterURL = `data:image/svg+xml,${encodeURIComponent(svg)}#f`;
  return (
    "<!DOCTYPE html><html><body>" +
    `<div style='width:64px;height:64px;background:red;filter:url("${filterURL}")'>` +
    "filter</div></body></html>"
  );
}

async function getHitCount(key) {
  const response = await fetch(
    `${counterURL}?count=${encodeURIComponent(key)}`
  );
  return +(await response.text());
}

async function displayMessage(subject, importURL) {
  await be_in_folder(folder);
  const msgDbHdr = addToFolder(subject, filterMessageBody(importURL));
  const msgHdr = await select_click_row(gMsgNo, AccessibilityUtils);
  Assert.equal(msgDbHdr, msgHdr, "selected message should be the new one");
  await assert_selected_and_displayed(gMsgNo);
}

add_task(async function test_svgFilterImportBlocked() {
  const key = Services.uuid.generateUUID().toString();
  const importURL = `${counterURL}?hit=${encodeURIComponent(key)}`;

  let blocked = false;
  const observer = subject => {
    if (subject.QueryInterface(Ci.nsIURI).spec == importURL) {
      blocked = true;
    }
  };
  Services.obs.addObserver(observer, "remote-content-blocked");
  try {
    await displayMessage("svg filter import blocked", importURL);
    await TestUtils.waitForCondition(
      async () => blocked || (await getHitCount(key)) > 0,
      "stylesheet imported by the SVG filter should be either blocked or loaded"
    );
  } finally {
    Services.obs.removeObserver(observer, "remote-content-blocked");
  }

  Assert.ok(blocked, "stylesheet imported by the SVG filter should be blocked");
  Assert.equal(
    await getHitCount(key),
    0,
    "stylesheet imported by the SVG filter should not be loaded"
  );
});

add_task(async function test_svgFilterImportAllowed() {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.message_display.disable_remote_image", false]],
  });
  const key = Services.uuid.generateUUID().toString();
  const importURL = `${counterURL}?hit=${encodeURIComponent(key)}`;

  await displayMessage("svg filter import allowed", importURL);
  await TestUtils.waitForCondition(
    async () => (await getHitCount(key)) == 1,
    "stylesheet imported by the SVG filter should be loaded"
  );
  await SpecialPowers.popPrefEnv();
});

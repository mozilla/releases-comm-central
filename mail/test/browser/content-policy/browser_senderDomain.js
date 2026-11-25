/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

const MAIL_URI_BASE = "chrome://messenger/content/email=";
const IMAGE_URL =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-policy/html/pass.png";
let folder;
let messageIndex = -1;

add_setup(async function () {
  folder = await create_folder("senderDomainContentPolicy");
  registerCleanupFunction(() => folder.deleteSelf(null));
});

/**
 * Returns the principal used to store a sender or sender-domain permission.
 *
 * @param {string} address - An email address or @domain entry.
 * @returns {nsIPrincipal} The sender permission principal.
 */
function senderPrincipal(address) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(MAIL_URI_BASE + address),
    {}
  );
}

/**
 * Displays a new message containing a remote image.
 *
 * @param {string} sender - The message author's email address.
 */
async function displayMessage(sender) {
  await be_in_folder(folder);
  messageIndex++;
  const source = [
    "X-Mozilla-Status: 0001",
    "X-Mozilla-Status2: 00000000",
    `Message-ID: <sender-domain-${messageIndex}@example.invalid>`,
    "Date: Wed, 11 Jun 2008 20:32:02 -0400",
    `From: Tester <${sender}>`,
    "To: recipient@example.invalid",
    `Subject: Sender domain ${messageIndex}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    `<html><body><img id="remoteImage" src="${IMAGE_URL}"></body></html>`,
    "",
  ].join("\r\n");
  folder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(MailStringUtils.stringToByteString(source));
  await select_click_row(messageIndex, AccessibilityUtils);
}

/**
 * Checks whether the displayed message's remote image loads.
 *
 * @param {boolean} shouldLoad - Whether the image should load.
 */
async function assertRemoteImage(shouldLoad) {
  await SpecialPowers.spawn(
    get_about_message().getMessagePaneBrowser(),
    [shouldLoad],
    async expected => {
      const image = content.document.getElementById("remoteImage");
      Assert.ok(image, "The message should contain the remote image");
      await image.decode().catch(() => {});
      Assert.equal(
        image.naturalWidth > 0,
        expected,
        `The remote image should ${expected ? "load" : "be blocked"}`
      );
    }
  );
}

add_task(async function test_domainPermissions() {
  const allow = Services.perms.ALLOW_ACTION;
  const deny = Services.perms.DENY_ACTION;
  for (const globalBlock of [true, false]) {
    await SpecialPowers.pushPrefEnv({
      set: [["mailnews.message_display.disable_remote_image", globalBlock]],
    });
    for (const {
      sender,
      permissions,
      shouldLoad,
      globalBlocks = [true, false],
    } of [
      {
        sender: "alice@example.com",
        permissions: [["@example.com", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "bob@news.example.com",
        permissions: [["@example.com", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "alice@EXAMPLE.COM",
        permissions: [["@example.com", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "alice@bücher.example",
        permissions: [["@xn--bcher-kva.example", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "alice@xn--bcher-kva.example",
        permissions: [["@xn--bcher-kva.example", deny]],
        shouldLoad: false,
        globalBlocks: [false],
      },
      {
        sender: "alice@example.com",
        permissions: [["@example.com", deny]],
        shouldLoad: false,
        globalBlocks: [false],
      },
      {
        sender: "bob@news.example.com",
        permissions: [["@example.com", deny]],
        shouldLoad: false,
        globalBlocks: [false],
      },
      {
        sender: "alice@example.com",
        permissions: [
          ["@example.com", deny],
          ["alice@example.com", allow],
        ],
        shouldLoad: true,
      },
      {
        sender: "alice@example.com",
        permissions: [
          ["@example.com", allow],
          ["alice@example.com", deny],
        ],
        shouldLoad: false,
      },
      {
        sender: "alice@EXAMPLE.COM",
        permissions: [
          ["@example.com", allow],
          ["alice@example.com", deny],
        ],
        shouldLoad: false,
      },
      {
        sender: "alice@EXAMPLE.COM",
        permissions: [
          ["@example.com", deny],
          ["alice@example.com", allow],
        ],
        shouldLoad: true,
      },
      {
        sender: "alice@bücher.example",
        permissions: [
          ["@xn--bcher-kva.example", allow],
          ["alice@xn--bcher-kva.example", deny],
        ],
        shouldLoad: false,
      },
      {
        sender: "Alice@example.com",
        permissions: [
          ["@example.com", allow],
          ["alice@example.com", deny],
        ],
        shouldLoad: true,
      },
      {
        sender: "alice*test@example.com",
        permissions: [["alice*test@example.com", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "*@example.com",
        permissions: [["*@example.com", allow]],
        shouldLoad: true,
        globalBlocks: [true],
      },
      {
        sender: "bob@example.com",
        permissions: [["*@example.com", allow]],
        shouldLoad: false,
        globalBlocks: [true],
      },
      {
        sender: "bob@example.com",
        permissions: [["*@example.com", deny]],
        shouldLoad: true,
        globalBlocks: [false],
      },
      {
        sender: "bob@deep.news.example.com",
        permissions: [
          ["@example.com", allow],
          ["@news.example.com", deny],
        ],
        shouldLoad: false,
      },
      {
        sender: "bob@deep.news.example.com",
        permissions: [
          ["@example.com", deny],
          ["@news.example.com", allow],
        ],
        shouldLoad: true,
      },
      {
        sender: "alice@notexample.com",
        permissions: [["@example.com", allow]],
        shouldLoad: false,
        globalBlocks: [true],
      },
      {
        sender: "alice@example.com.evil.invalid",
        permissions: [["@example.com", allow]],
        shouldLoad: false,
        globalBlocks: [true],
      },
      {
        sender: "alice@example.co.uk",
        permissions: [["@co.uk", allow]],
        shouldLoad: false,
        globalBlocks: [true],
      },
    ]) {
      if (!globalBlocks.includes(globalBlock)) {
        continue;
      }
      info(
        `Checking ${sender}, global block ${globalBlock}, permissions ${JSON.stringify(permissions)}`
      );
      for (const [address, permission] of permissions) {
        Services.perms.addFromPrincipal(
          senderPrincipal(address),
          "image",
          permission
        );
      }
      try {
        await displayMessage(sender);
        await assertRemoteImage(shouldLoad);
      } finally {
        for (const [address] of permissions) {
          Services.perms.removeFromPrincipal(senderPrincipal(address), "image");
        }
      }
    }
    await SpecialPowers.popPrefEnv();
  }
});

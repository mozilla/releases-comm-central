/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

var { get_notification_button, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
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
 * @param {boolean} [twoOrigins=false] - Include an image from a second origin.
 * @param {string} [imageURL=IMAGE_URL] - The URL of the remote image.
 */
async function displayMessage(
  sender,
  twoOrigins = false,
  imageURL = IMAGE_URL
) {
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
    `<html><body><img id="remoteImage" src="${imageURL}">` +
      (twoOrigins
        ? `<img src="${imageURL.replace("mochi.test:8888", "example.org")}">`
        : "") +
      "</body></html>",
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

add_task(async function test_domainMenuAction() {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.message_display.disable_remote_image", true]],
  });
  const principal = senderPrincipal("@example.com");
  registerCleanupFunction(() =>
    Services.perms.removeFromPrincipal(principal, "image")
  );
  await displayMessage("alice@EXAMPLE.COM");
  const aboutMessage = get_about_message();
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "remoteContent"
  );
  const button = get_notification_button(
    aboutMessage,
    "mail-notification-top",
    "remoteContent",
    { popup: "remoteContentOptions" }
  );
  const popup = aboutMessage.document.getElementById("remoteContentOptions");
  EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  registerCleanupFunction(() => popup.hidePopup());

  const exactItem = [...popup.querySelectorAll(".allow-remote-uri")].find(
    item => item.value == senderPrincipal("alice@example.com").origin
  );
  Assert.ok(exactItem, "The menu should normalize the exact sender's domain");
  Assert.deepEqual(
    aboutMessage.document.l10n.getAttributes(exactItem),
    {
      id: "allow-remote-content-sender",
      args: { email: "alice@example.com" },
    },
    "The exact sender action should describe an individual email address"
  );
  const imageOrigin = Services.io.newURI(IMAGE_URL).prePath;
  const websiteItem = [...popup.querySelectorAll(".allow-remote-uri")].find(
    item => item.value == imageOrigin
  );
  Assert.ok(websiteItem, "The menu should offer the image's website origin");
  Assert.deepEqual(
    aboutMessage.document.l10n.getAttributes(websiteItem),
    {
      id: "allow-remote-content-website",
      args: { origin: imageOrigin },
    },
    "The website action should include subdomains and retain the origin's scheme and port"
  );
  const domainItem = [...popup.querySelectorAll(".allow-remote-uri")].find(
    item => item.value == principal.origin
  );
  Assert.ok(domainItem, "The menu should offer the sender domain");
  Assert.deepEqual(
    aboutMessage.document.l10n.getAttributes(domainItem),
    {
      id: "allow-remote-content-sender-domain",
      args: { domain: "example.com" },
    },
    "The domain action should describe the domain permission"
  );
  const allowAll = aboutMessage.document.getElementById(
    "remoteContentOptionAllowAll"
  );
  Assert.equal(
    aboutMessage.document.l10n.getAttributes(allowAll).args.count,
    1,
    "The origin count should exclude both sender entries"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(allowAll),
    "Allow all should be hidden for one image origin"
  );

  const loaded = BrowserTestUtils.browserLoaded(
    aboutMessage.getMessagePaneBrowser()
  );
  popup.activateItem(domainItem);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  await loaded;
  await TestUtils.waitForCondition(
    () =>
      Services.perms.testExactPermissionFromPrincipal(principal, "image") ==
      Services.perms.ALLOW_ACTION,
    "The domain action should save an Allow permission"
  );
  await assertRemoteImage(true);
  Services.perms.removeFromPrincipal(principal, "image");
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_menuOriginsWithoutSubdomains() {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.message_display.disable_remote_image", true]],
  });
  for (const host of ["127.0.0.1", "[::1]", "localhost"]) {
    const imageURL = IMAGE_URL.replace("mochi.test", host);
    await displayMessage("alice@example.com", false, imageURL);
    const aboutMessage = get_about_message();
    await wait_for_notification_to_show(
      aboutMessage,
      "mail-notification-top",
      "remoteContent"
    );
    const button = get_notification_button(
      aboutMessage,
      "mail-notification-top",
      "remoteContent",
      { popup: "remoteContentOptions" }
    );
    const popup = aboutMessage.document.getElementById("remoteContentOptions");
    EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage);
    await BrowserTestUtils.waitForPopupEvent(popup, "shown");
    registerCleanupFunction(() => popup.hidePopup());

    const origin = Services.io.newURI(imageURL).prePath;
    const item = [...popup.querySelectorAll(".allow-remote-uri")].find(
      entry => entry.value == origin
    );
    Assert.ok(item, "The menu should offer the image origin");
    Assert.deepEqual(
      aboutMessage.document.l10n.getAttributes(item),
      {
        id: "allow-remote-content-resource",
        args: { origin },
      },
      "Origins without a registrable domain should omit subdomain wording"
    );
    popup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  }
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_allowAllExcludesSenders() {
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.message_display.disable_remote_image", true]],
  });
  const imagePrincipals = [
    IMAGE_URL,
    IMAGE_URL.replace("mochi.test:8888", "example.org"),
  ].map(url =>
    Services.scriptSecurityManager.createContentPrincipal(
      Services.io.newURI(url),
      {}
    )
  );
  registerCleanupFunction(() => {
    for (const principal of imagePrincipals) {
      Services.perms.removeFromPrincipal(principal, "image");
    }
  });
  await displayMessage("alice@example.com", true);
  const aboutMessage = get_about_message();
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "remoteContent"
  );
  const button = get_notification_button(
    aboutMessage,
    "mail-notification-top",
    "remoteContent",
    { popup: "remoteContentOptions" }
  );
  const popup = aboutMessage.document.getElementById("remoteContentOptions");
  EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  registerCleanupFunction(() => popup.hidePopup());
  const allowAll = aboutMessage.document.getElementById(
    "remoteContentOptionAllowAll"
  );
  Assert.equal(
    aboutMessage.document.l10n.getAttributes(allowAll).args.count,
    2,
    "Allow all should count only image origins"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(allowAll),
    "Allow all should be offered for two image origins"
  );
  const loaded = BrowserTestUtils.browserLoaded(
    aboutMessage.getMessagePaneBrowser()
  );
  popup.activateItem(allowAll);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  await loaded;
  await assertRemoteImage(true);
  for (const address of ["alice@example.com", "@example.com"]) {
    Assert.equal(
      Services.perms.testExactPermissionFromPrincipal(
        senderPrincipal(address),
        "image"
      ),
      Services.perms.UNKNOWN_ACTION,
      "Allow all should leave sender permissions unset"
    );
  }
  for (const principal of imagePrincipals) {
    Assert.equal(
      Services.perms.testExactPermissionFromPrincipal(principal, "image"),
      Services.perms.ALLOW_ACTION,
      "Allow all should save each image-origin permission"
    );
    Services.perms.removeFromPrincipal(principal, "image");
  }
  await SpecialPowers.popPrefEnv();
});

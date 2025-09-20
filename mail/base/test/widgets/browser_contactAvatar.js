/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the contact-avatar custom element is properly updated when data is
 * set.
 */

const { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);
const tabmail = document.getElementById("tabmail");
/**
 * existingAvatar - references the element that is already available in the html
 *   when the page is loaded.
 * runtimeAvatar - references an element that is created at runtime and then
 *   appended to the DOM.
 * recipientAvatar - references another element created at runtime, but only
 *   used to handle a recipient string and not an nsIABCard.
 */
let win, doc, existingAvatar, runtimeAvatar, recipientAvatar;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: SimpleTest.getTestFileURL("files/contactAvatar.xhtml"),
  });

  info("Loading tab...");
  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;
  info("Waiting for custom element...");
  await win.customElements.whenDefined("contact-avatar");

  info("Add data to existing element...");
  const card = new AddrBookCard();
  card.firstName = "Someone";
  card.lastName = "Mochitest";
  card.displayName = "Someone Mochitest";
  card.primaryEmail = "someone-mochitest@invalid.foo";
  card._vCardProperties.addValue(
    "photo",
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  );
  existingAvatar = doc.querySelector("contact-avatar");
  existingAvatar.setData({ card });

  info("Generate a new element at runtime...");
  runtimeAvatar = doc.createElement("contact-avatar");
  doc.body.appendChild(runtimeAvatar);
  const secondCard = new AddrBookCard();
  secondCard.displayName = "Another Mochitest";
  runtimeAvatar.setData({ card: secondCard });

  info("Generate a new element with just a recipient...");
  recipientAvatar = doc.createElement("contact-avatar");
  doc.body.appendChild(recipientAvatar);
  recipientAvatar.setData({ recipient: "test" });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function testExistingAvatarWithPhoto() {
  Assert.ok(existingAvatar, "The first contact avatar should exist");

  const image = existingAvatar.shadowRoot.querySelector("img");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(image),
    "The contact avatar image should be visible"
  );

  Assert.deepEqual(document.l10n.getAttributes(image), {
    id: "avatar-picture-alt-text",
    args: {
      address: "someone-mochitest@invalid.foo",
    },
  });
});

add_task(async function testExistingAvatarWithoutPhoto() {
  Assert.ok(runtimeAvatar, "The second contact avatar should exist");

  const image = runtimeAvatar.shadowRoot.querySelector("img");
  Assert.ok(
    BrowserTestUtils.isHidden(image),
    "The contact avatar image should be hidden"
  );

  Assert.equal(
    runtimeAvatar.shadowRoot.querySelector("span").textContent,
    "A",
    "The placeholder letter should match the first letter of the display name"
  );
});

add_task(async function testUpdateAvatarWithoutDisplayName() {
  const card = new AddrBookCard();
  card.primaryEmail = "other-email@invalid.foo";

  runtimeAvatar.setData({ card });
  Assert.equal(
    runtimeAvatar.shadowRoot.querySelector("span").textContent,
    "O",
    "The placeholder letter should match the first letter of the primary email"
  );
});

add_task(async function testExistingAvatarWithRecipient() {
  Assert.ok(recipientAvatar, "The third contact avatar should exist");

  Assert.equal(
    recipientAvatar.shadowRoot.querySelector("span").textContent,
    "T",
    "The placeholder letter should match the first letter of the recipient name"
  );
});

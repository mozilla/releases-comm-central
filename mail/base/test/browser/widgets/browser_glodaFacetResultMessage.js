/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let win, doc;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/browser/widgets/files/glodaFacetResultMessage.xhtml",
  });

  info("Loading tab...");
  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;
  await win.customElements.whenDefined("facet-result-message");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

/**
 * Create a minimal gloda-like message object.
 *
 * @param {object[]} aRecipients - The recipient identities.
 * @returns {object} The message.
 */
function createMessage(aRecipients) {
  return {
    subject: "Test subject",
    from: { value: "author@example.com", contact: { name: "Author" } },
    date: new Date(),
    recipients: aRecipients,
    starred: false,
    read: true,
  };
}

/**
 * Render a message with the given recipients and return the resulting nodes.
 *
 * @param {object[]} aRecipients - The recipient identities.
 * @returns {Element} The facet-result-message element.
 */
function renderMessage(aRecipients) {
  const element = doc.createElement("facet-result-message");
  element.message = createMessage(aRecipients);
  doc.body.appendChild(element);
  return element;
}

/**
 * Get the rendered recipient names.
 *
 * @param {Element} aElement - The facet-result-message element.
 * @returns {string[]} The rendered recipient names.
 */
function getRecipients(aElement) {
  return [...aElement.querySelectorAll(".message-recipient")].map(
    node => node.textContent
  );
}

function recipient(name) {
  return { contact: { name } };
}

add_task(function testSingleRecipient() {
  const element = renderMessage([recipient("Alice")]);

  Assert.deepEqual(
    getRecipients(element),
    ["Alice"],
    "a single recipient should be shown"
  );
  element.remove();
});

add_task(function testMultipleRecipients() {
  const element = renderMessage([recipient("Alice"), recipient("Bob")]);

  Assert.deepEqual(
    getRecipients(element),
    ["Alice", "Bob"],
    "all recipients should be shown"
  );
  element.remove();
});

add_task(function testExactlyMaxRecipients() {
  const element = renderMessage([
    recipient("Alice"),
    recipient("Bob"),
    recipient("Carol"),
  ]);

  Assert.deepEqual(
    getRecipients(element),
    ["Alice", "Bob", "Carol"],
    "all three recipients should be shown"
  );
  Assert.ok(
    !element.textContent.includes("other"),
    "no 'others' label should be shown for exactly three recipients"
  );
  element.remove();
});

add_task(function testOneOtherRecipient() {
  const element = renderMessage([
    recipient("Alice"),
    recipient("Bob"),
    recipient("Carol"),
    recipient("Dave"),
  ]);

  Assert.deepEqual(
    getRecipients(element),
    ["Alice", "Bob", "Carol", "1 other"],
    "the singular 'other' form should be used for a single extra recipient"
  );
  element.remove();
});

add_task(function testMoreThanMaxRecipients() {
  const element = renderMessage([
    recipient("Alice"),
    recipient("Bob"),
    recipient("Carol"),
    recipient("Dave"),
    recipient("Erin"),
  ]);

  Assert.deepEqual(
    getRecipients(element),
    ["Alice", "Bob", "Carol", "2 others"],
    "the recipients should be limited and an 'others' label added"
  );
  element.remove();
});

add_task(function testSeparatorsAreClassified() {
  const element = renderMessage([
    recipient("Alice"),
    recipient("Bob"),
    recipient("Carol"),
  ]);

  Assert.deepEqual(
    [...element.querySelectorAll(".message-recipient-separator")].map(
      node => node.textContent
    ),
    [", ", ", and "],
    "separator nodes should be rendered by Intl.ListFormat"
  );
  element.remove();
});

add_task(function testRecipientWithoutNameIsSkipped() {
  const element = renderMessage([
    { contact: { name: "" } },
    { contact: {} },
    recipient("Bob"),
  ]);

  Assert.deepEqual(
    getRecipients(element),
    ["Bob", "2 others"],
    "recipients without a name should not be rendered, but still be counted"
  );
  element.remove();
});

add_task(function testOthersCountUsesAllRecipients() {
  // The "N others" count must cover every recipient that is not shown, so
  // that the names on screen plus the label always add up to the total
  // number of recipients.
  const element = renderMessage([
    { contact: { name: "" } },
    recipient("Bob"),
    recipient("Carol"),
    recipient("Dave"),
  ]);

  Assert.deepEqual(
    getRecipients(element),
    ["Bob", "Carol", "Dave", "1 other"],
    "the three named recipients are shown and the nameless one is counted as other"
  );
  element.remove();
});

add_task(function testToLabel() {
  const element = renderMessage([recipient("Alice")]);

  const toLabel = element.querySelector(".message-to-label");
  Assert.ok(toLabel, "the To: label should be present");
  Assert.equal(toLabel.textContent, "to:", "the To: label should read 'to:'");
  element.remove();
});

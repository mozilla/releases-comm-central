/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let attachment, browser;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAttachment.xhtml",
  });

  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser);
  browser.focus();
  await SimpleTest.promiseFocus(browser.contentWindow);
  attachment = browser.contentDocument.querySelector(
    'li[is="calendar-dialog-attachment"]'
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

// Clicking the link isn't effective in this test setup, since the link handler
// for the content tab will take over. So it's tested separately in the
// integration tests only.

add_task(function test_attributeChanges() {
  const label = attachment.querySelector("a");
  Assert.equal(label.textContent, "", "Should have no label set");
  Assert.equal(label.getAttribute("href"), "", "Should have no href set");

  attachment.setAttribute("label", "test");
  Assert.equal(
    label.textContent,
    "test",
    "Should update the label from the attribute"
  );

  attachment.setAttribute("url", "https://example.com");
  Assert.equal(
    label.href,
    "https://example.com/",
    "Should transfer the URL to the href"
  );
});

add_task(async function test_labelsSetWhenFirstConnecting() {
  const newAttachment = browser.contentDocument.createElement("li", {
    is: "calendar-dialog-attachment",
  });
  newAttachment.setAttribute("label", "New attachment");
  newAttachment.setAttribute("url", "https://example.org");
  let label = newAttachment.querySelector("a");

  Assert.ok(!label, "Should not have created the label yet");

  browser.contentDocument.querySelector("ul").append(newAttachment);
  label = newAttachment.querySelector("a");

  Assert.equal(
    label.textContent,
    "New attachment",
    "Should update label once connected"
  );
  Assert.equal(
    label.href,
    "https://example.org/",
    "Should update href once connected"
  );

  newAttachment.remove();
});

add_task(async function test_icon() {
  const icon = attachment.querySelector("img");

  Assert.equal(
    icon.getAttribute("src"),
    "",
    "Should start out with an empty src"
  );
  Assert.equal(icon.srcset, "", "Should start out with an empty srcset");

  attachment.setAttribute(
    "icon",
    "chrome://messenger/skin/icons/sm/sparkle-star.svg"
  );

  Assert.equal(
    icon.src,
    "chrome://messenger/skin/icons/sm/sparkle-star.svg",
    "Should apply the given icon URL to the image element"
  );
  Assert.equal(
    icon.srcset,
    "",
    "Should provide an empty srcset for a single URL target"
  );

  attachment.setAttribute("icon", "moz-icon://dummy.html");

  Assert.equal(
    icon.getAttribute("src"),
    "",
    "Should set an empty src if the icon URL can be used as srcset"
  );
  Assert.equal(
    icon.srcset,
    "moz-icon://dummy.html?size=16&scale=1 1x, moz-icon://dummy.html?size=16&scale=2 2x, moz-icon://dummy.html?size=16&scale=3 3x",
    "Should generate srcset for moz-icon URI"
  );

  attachment.setAttribute("icon", "");

  Assert.equal(
    icon.getAttribute("src"),
    "",
    "Should have an empty src if there is no icon"
  );
  Assert.equal(
    icon.srcset,
    "",
    "Should have an empty srcset if there is no icon"
  );
});

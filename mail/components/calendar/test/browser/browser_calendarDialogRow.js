/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let row;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  row = tab.browser.contentWindow.document.querySelector("calendar-dialog-row");
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(function test_slotElements() {
  const labelSlotElement = row.shadowRoot
    .querySelector('slot[name="label"]')
    .assignedElements()[0];
  Assert.equal(
    labelSlotElement,
    row.querySelector('[slot="label"]'),
    "Text label should be in label slot"
  );

  const contentSlotElement = row.shadowRoot
    .querySelector('slot[name="content"]')
    .assignedElements()[0];
  Assert.equal(
    contentSlotElement,
    row.querySelector('[slot="content"]'),
    "Text content should be in content slot"
  );

  const iconSlotElement = row.shadowRoot
    .querySelector('slot[name="icon"]')
    .assignedElements()[0];
  Assert.equal(
    iconSlotElement,
    row.querySelector('[slot="icon"]'),
    "Icon should be in icon slot"
  );
});

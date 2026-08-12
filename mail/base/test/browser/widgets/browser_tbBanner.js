/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let tab;
let contentWindow;
let doc;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/browser/widgets/files/tbBanner.xhtml",
  });

  registerCleanupFunction(() => {
    tabmail.closeTab(tab);
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  contentWindow = tab.browser.contentWindow;
  doc = contentWindow.document;
});

add_task(async function test_loadsFixture() {
  const banner = doc.getElementById("basic");
  const bannerElement =
    tab.browser.contentWindow.customElements.get("tb-banner");

  Assert.ok(bannerElement, "tb-banner is registered");
  Assert.ok(banner, "Fixture provides a tb-banner element");
  Assert.ok(banner instanceof bannerElement, "tb-banner uses the Banner class");
  const { shadowRoot } = banner;
  Assert.ok(shadowRoot, "tb-banner attaches a shadow root");
  Assert.ok(
    shadowRoot.querySelector("link[href$='tb-banner.css']"),
    "tb-banner loads its shared stylesheet"
  );
  Assert.ok(
    doc.querySelector(
      "link[rel='localization'][href='messenger/tb-banner.ftl']"
    ),
    "Fixture provides tb-banner Fluent strings"
  );
  Assert.ok(
    shadowRoot.querySelector('slot[name="title"]'),
    "tb-banner renders the title slot"
  );
  Assert.ok(
    shadowRoot.querySelector("slot[name='description']"),
    "tb-banner renders the description slot"
  );
});

add_task(async function test_defaultVariantAndUpdateVariant() {
  const banner = doc.getElementById("basic");

  Assert.equal(
    banner.getAttribute("variant"),
    "info",
    "Default variant is info"
  );

  banner.update({ variant: "danger" });

  Assert.equal(
    banner.getAttribute("variant"),
    "danger",
    "update() applies a supported variant"
  );
  const icon = banner.shadowRoot.getElementById("icon");
  Assert.ok(icon, "tb-banner renders a status icon");
  Assert.equal(icon.alt, "", "tb-banner renders a decorative status icon");

  banner.update({ variant: "bogus" });
  Assert.equal(
    banner.getAttribute("variant"),
    "info",
    "update() normalizes an unsupported variant to 'info'"
  );

  const expandedBanner = doc.getElementById("expanded");

  Assert.equal(
    expandedBanner.getAttribute("variant"),
    "danger",
    "Defined variant attribute kept"
  );
});

add_task(async function test_expandAndCollapse() {
  const banner = doc.getElementById("collapsible");
  Assert.ok(banner, "Fixture provides a collapsible tb-banner element");

  const { shadowRoot } = banner;
  const details = shadowRoot.querySelector("details");
  const description = shadowRoot.getElementById("description");
  const actionText = shadowRoot.getElementById("actionText");
  Assert.ok(details, "tb-banner renders a details element");
  Assert.ok(description, "tb-banner renders a description element");
  Assert.ok(actionText, "tb-banner renders action text");

  // A banner with description content starts collapsed.
  Assert.ok(!banner.expanded, "Banner with a description starts collapsed");
  Assert.ok(!details.open, "Details element is closed while collapsed");
  Assert.ok(
    BrowserTestUtils.isVisible(actionText),
    "Action text is visible when a description is present"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(description),
    "Description is hidden while collapsed"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-more",
    "Collapsed banner shows the expand action text"
  );

  // Expanding through the property reveals the description.
  banner.expanded = true;
  Assert.ok(banner.expanded, "Setting expanded reflects the expanded state");
  Assert.ok(details.open, "Expanding opens the details element");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(description),
    "Waiting for the description to be revealed"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-less",
    "Expanded banner shows the collapse action text"
  );

  // Collapsing through the property hides the description again.
  banner.expanded = false;
  Assert.ok(!banner.expanded, "Clearing expanded clears the expanded state");
  Assert.ok(!details.open, "Collapsing closes the details element");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(description),
    "Waiting for the description to be hidden"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-more",
    "Collapsed banner shows the expand action text again"
  );

  // update() drives the same expand behavior as the property.
  banner.update({ expanded: true });
  Assert.ok(banner.expanded, "update() expands the banner");
  Assert.ok(details.open, "update() opens the details element");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(description),
    "waiting for update() to reveal the description"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-less",
    "update() shows the collapse action text"
  );

  // Restore the collapsed baseline for later tasks.
  banner.expanded = false;
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(description),
    "waiting for the banner to return to the collapsed baseline"
  );
});

add_task(async function test_expandAndCollapseByUserClick() {
  const banner = doc.getElementById("collapsible");
  Assert.ok(banner, "Fixture provides a collapsible tb-banner element");

  const { shadowRoot } = banner;
  const summary = shadowRoot.querySelector("summary");
  const details = shadowRoot.querySelector("details");
  const description = shadowRoot.getElementById("description");
  const actionText = shadowRoot.getElementById("actionText");
  Assert.ok(summary, "tb-banner renders a summary control");
  Assert.ok(
    !banner.expanded,
    "Banner starts collapsed before user interaction"
  );

  summary.scrollIntoView({ block: "center" });

  // The user expands the banner by clicking the summary.
  let toggled = BrowserTestUtils.waitForEvent(details, "toggle");
  EventUtils.synthesizeMouseAtCenter(summary, {}, contentWindow);
  await toggled;

  Assert.ok(details.open, "Clicking the summary opens the details element");
  await TestUtils.waitForCondition(
    () => banner.expanded,
    "Waiting for the banner to reflect the expanded state after a click"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(description),
    "Clicking the summary reveals the description"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-less",
    "Clicking to expand shows the collapse action text"
  );

  // The user collapses the banner by clicking the summary again.
  toggled = BrowserTestUtils.waitForEvent(details, "toggle");
  EventUtils.synthesizeMouseAtCenter(summary, {}, contentWindow);
  await toggled;

  Assert.ok(
    !details.open,
    "Clicking the summary again closes the details element"
  );
  await TestUtils.waitForCondition(
    () => !banner.expanded,
    "waiting for the banner to reflect the collapsed state after a click"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(description),
    "Clicking the summary again hides the description"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-more",
    "Clicking to collapse shows the expand action text"
  );
});

add_task(async function test_expandWithoutDescriptionIsNoOp() {
  const banner = doc.getElementById("basic");
  Assert.ok(
    banner,
    "Fixture provides a tb-banner element without a description"
  );

  const { shadowRoot } = banner;
  const summary = shadowRoot.querySelector("summary");
  const details = shadowRoot.querySelector("details");
  const description = shadowRoot.getElementById("description");
  const actionText = shadowRoot.getElementById("actionText");

  // Without a description there is no disclosure affordance.
  Assert.ok(!banner.expanded, "Banner without a description starts collapsed");
  Assert.ok(
    BrowserTestUtils.isHidden(actionText),
    "Action text is hidden without a description"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(description),
    "Description is hidden without a description"
  );
  Assert.equal(
    summary.tabIndex,
    -1,
    "Summary is removed from the tab order without a description"
  );

  // Setting the property cannot expand a banner that has no description.
  banner.expanded = true;
  Assert.ok(
    !banner.expanded,
    "Property cannot expand a banner without a description"
  );
  Assert.ok(
    !details.open,
    "Details stays closed when set expanded without a description"
  );

  // Clicking the summary cannot expand it either.
  summary.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(summary, {}, contentWindow);
  await new Promise(resolve => contentWindow.requestAnimationFrame(resolve));

  Assert.ok(
    !banner.expanded,
    "Clicking cannot expand a banner without a description"
  );
  Assert.ok(
    !details.open,
    "Details stays closed when clicked without a description"
  );
});

add_task(async function test_defaultExpandedBannerCollapsesOnClick() {
  const banner = doc.getElementById("expanded");
  Assert.ok(banner, "Fixture provides a default-expanded tb-banner element");

  const { shadowRoot } = banner;
  const summary = shadowRoot.querySelector("summary");
  const details = shadowRoot.querySelector("details");
  const description = shadowRoot.getElementById("description");
  const actionText = shadowRoot.getElementById("actionText");
  Assert.ok(summary, "tb-banner renders a summary control");

  Assert.ok(banner.expanded, "Banner with expanded attribute starts expanded");
  Assert.ok(details.open, "Details element is open by default");
  Assert.ok(
    BrowserTestUtils.isVisible(description),
    "Description is visible by default"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-less",
    "Default-expanded banner shows the collapse action text"
  );

  summary.scrollIntoView({ block: "center" });

  // The user collapses the banner by clicking the summary.
  const toggled = BrowserTestUtils.waitForEvent(details, "toggle");
  EventUtils.synthesizeMouseAtCenter(summary, {}, contentWindow);
  await toggled;

  Assert.ok(!details.open, "Clicking the summary closes the details element");
  await TestUtils.waitForCondition(
    () => !banner.expanded,
    "Waiting for the banner to reflect the collapsed state after a click"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(description),
    "Clicking the summary hides the description"
  );
  Assert.equal(
    doc.l10n.getAttributes(actionText).id,
    "tb-banner-show-more",
    "Collapsed banner shows the expand action text"
  );

  // Restore the default expanded baseline for later tasks.
  banner.expanded = true;
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(description),
    "Waiting for the banner to return to its default expanded baseline"
  );
});

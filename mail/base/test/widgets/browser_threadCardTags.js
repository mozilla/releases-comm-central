/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let win, doc, existingFilledTag, existingEmptyTag, runtimeGeneratedTag;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/widgets/files/threadCardTags.xhtml",
  });

  info("Loading tab...");
  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;
  info("Waiting for custom element...");
  await win.customElements.whenDefined("thread-card-tags");

  info("Add tags to existing element...");
  doc
    .getElementById("existingEmptyTag")
    .setAttribute("tags", "$label1 $label2 notjunk something");

  info("Generate a new element at runtime...");
  runtimeGeneratedTag = doc.createElement("thread-card-tags");
  runtimeGeneratedTag.setAttribute("tags", "$label1 $label2 notjunk something");
  doc.body.appendChild(runtimeGeneratedTag);

  existingFilledTag = doc.getElementById("existingFilledTag");
  Assert.ok(
    existingFilledTag,
    "the tag element with existing filled tags should exist"
  );

  existingEmptyTag = doc.getElementById("existingEmptyTag");
  Assert.ok(
    existingEmptyTag,
    "the tag element without filled tags should exist"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

async function subTestTagsHaveData(element) {
  const images = [...element.shadowRoot.querySelectorAll(".tag-icon")];
  Assert.ok(
    BrowserTestUtils.isVisible(images.at(0)),
    "The first tag image should be visible"
  );
  Assert.equal(
    images.at(0).style.getPropertyValue("--tag-color"),
    "var(--tag-\\$label1-backcolor)",
    "The first tag color should have the correct variable"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(images.at(1)),
    "The second tag image should be visible"
  );
  Assert.equal(
    images.at(1).style.getPropertyValue("--tag-color"),
    "var(--tag-\\$label2-backcolor)",
    "The second tag color should have the correct variable"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(images.at(2)),
    "The third tag image should be hidden"
  );
  Assert.ok(
    !images.at(2).style.getPropertyValue("--tag-color"),
    "The third tag image should not have a tag color property"
  );
}

async function subTestTagsHaveMoreData(element) {
  element.setAttribute(
    "tags",
    "$label1 $label2 $label3 $label4 $label5 notjunk something"
  );
  const images = [...element.shadowRoot.querySelectorAll(".tag-icon")];
  Assert.ok(
    BrowserTestUtils.isVisible(images.at(0)),
    "The first tag image should be visible"
  );
  Assert.equal(
    images.at(0).style.getPropertyValue("--tag-color"),
    "var(--tag-\\$label1-backcolor)",
    "The first tag color should have the correct variable"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(images.at(1)),
    "The second tag image should be visible"
  );
  Assert.equal(
    images.at(1).style.getPropertyValue("--tag-color"),
    "var(--tag-\\$label2-backcolor)",
    "The second tag color should have the correct variable"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(images.at(2)),
    "The third tag image should be visible"
  );
  Assert.equal(
    images.at(2).style.getPropertyValue("--tag-color"),
    "var(--tag-\\$label3-backcolor)",
    "The third tag color should have the correct variable"
  );
  const more = element.shadowRoot.querySelector(".tag-more");
  Assert.ok(BrowserTestUtils.isVisible(more), "The more tag should be visible");

  const tagsMoreFormatter = new Intl.NumberFormat(undefined, {
    signDisplay: "always",
  });
  Assert.equal(
    more.textContent,
    tagsMoreFormatter.format(2),
    "The more tag should have the correct string count"
  );
  for (const tag of ["Important", "Work", "Personal", "To Do", "Later"]) {
    Assert.stringContains(
      element.title,
      tag,
      `The element tooltip should contain the ${tag} tag`
    );
  }
}

add_task(async function testTagsData() {
  await subTestTagsHaveData(existingFilledTag);
  await subTestTagsHaveData(existingEmptyTag);
  await subTestTagsHaveData(runtimeGeneratedTag);
  await subTestTagsHaveMoreData(runtimeGeneratedTag);
});

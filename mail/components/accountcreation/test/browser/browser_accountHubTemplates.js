/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getTemplate } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/modules/TemplateLoader.mjs",
  { global: "current" }
);
const { templates } = ChromeUtils.importESModule(
  `${getRootDirectory(gTestPath)}files/accountHubTemplates.mjs`,
  { global: "current" }
);
let testContainer;

add_setup(function () {
  if (!customElements.get("account-hub-radio-card-large")) {
    ChromeUtils.importESModule(
      "chrome://messenger/content/accountcreation/content/widgets/account-hub-radio-card-large.mjs",
      { global: "current" }
    );
  }

  testContainer = document.createElement("div");
  document.body.append(testContainer);

  registerCleanupFunction(() => {
    testContainer.remove();
  });
});

add_task(function test_loadsPackagedTemplates() {
  const targetDocument = document.implementation.createHTMLDocument();

  for (const [file, markup] of Object.entries(templates)) {
    info(`Loading ${file}`);
    const template = getTemplate(markup);
    const fragment = targetDocument.importNode(template, true);

    Assert.ok(
      fragment.firstElementChild,
      `${file} should contain component markup`
    );
    Assert.equal(
      fragment.ownerDocument,
      targetDocument,
      `${file} should produce contents for the supplied document`
    );
    Assert.ok(
      !/^\s*#(?:if|else|endif|include)/m.test(markup),
      `${file} should not contain build directives after packaging`
    );
  }
});

add_task(function test_radioCardFormAssociation() {
  const template = getTemplate(`
    <template>
      <form>
        <account-hub-radio-card-large
          name="protocol"
          value="imap"
          aria-checked="true"
        >
          <span slot="title">IMAP</span>
        </account-hub-radio-card-large>
      </form>
    </template>
  `);

  testContainer.append(document.importNode(template, true));

  const form = testContainer.querySelector("form");
  const card = testContainer.querySelector("account-hub-radio-card-large");

  Assert.ok(form, "The imported fragment should contain a form");
  Assert.ok(card, "The imported form should contain a radio card");
  Assert.ok(card.shadowRoot, "The radio card should load its own template");
  Assert.ok(card.checked, "The radio card should preserve its selected state");

  const data = new FormData(form);

  Assert.equal(
    data.get("protocol"),
    "imap",
    "The imported radio card should be associated with its form"
  );

  const secondFragment = document.importNode(template, true);
  const secondForm = secondFragment.querySelector("form");
  const secondCard = secondFragment.querySelector(
    "account-hub-radio-card-large"
  );

  testContainer.append(secondFragment);
  card.checked = false;

  Assert.ok(
    secondCard.shadowRoot.querySelector("slot[name=title]"),
    "The second radio card should copy the cached template contents"
  );
  Assert.ok(
    secondCard.checked,
    "Changing the first radio card should leave the second card checked"
  );
  Assert.equal(
    new FormData(secondForm).get("protocol"),
    "imap",
    "The second radio card should submit its own form value"
  );
});

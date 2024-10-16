/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * List of custom elements that should be available, with a boolean indicating
 * if it should be lazy loaded.
 *
 * @type {Record<string, boolean>}
 */
const EXPECTED_CUSTOM_ELEMENTS = {
  "conversation-browser": false,
  "gloda-autocomplete-input": false,
  "chat-tooltip": false,
  "treecol-image": false,
  "menulist-editable": false,
  "attachment-list": false,
  "mail-address-pill": false,
  "mail-recipients-area": false,
  statuspanel: false,
  "folder-summary": true,
  "menulist-addrbooks": true,
  "folder-menupopup": false,
  "toolbarbutton-menu-button": false,
};

add_task(function test_customElementsAvailable() {
  for (const [tag, lazyLoaded] of Object.entries(EXPECTED_CUSTOM_ELEMENTS)) {
    Assert.equal(
      Boolean(customElements.get(tag)),
      !lazyLoaded,
      `Should have expected initial registration state for ${tag}`
    );

    document.createElement(tag);

    Assert.ok(
      Boolean(customElements.get(tag)),
      `${tag} should be defined after creating an element of its type`
    );

    info(`Ensure creating a second ${tag} element does not throw`);
    document.createElement(tag);
  }
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
});

class ConversationView extends HTMLElement {
  connectedCallback() {}

  onItemsAdded() {}
  onItemsModified() {}
  onItemsRemoved() {}
  onQueryCompleted(collection) {
    // TODO: This is temporary as we're leveraging the multimessagebrowser
    // but in the future this custom element will handle its own UI.
    this.dispatchEvent(
      new CustomEvent("show-conversation-view", {
        bubbles: true,
        detail: { collection },
      })
    );
  }

  show(headers) {
    lazy.Gloda.getMessageCollectionForHeader(headers, this);
  }
}
customElements.define("conversation-view", ConversationView);

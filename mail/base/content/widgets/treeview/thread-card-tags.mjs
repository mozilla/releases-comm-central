/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const tagsMoreFormatter = new Intl.NumberFormat(undefined, {
  signDisplay: "always",
});
const tagsTitleFormatter = new Intl.ListFormat();

/**
 * Visual representation of message tags up to 3 images, followed by a visual
 * counter of all other tags.
 *
 * @tagname thread-card-tags
 * @attribute {string} tags - The list of tags to visualize as images.
 */
class ThreadCardTags extends HTMLElement {
  static observedAttributes = ["tags"];

  /** @type {NodeList} */
  #images;

  /** @type {HTMLSpanElement} */
  #more;

  /** @type {integer} */
  static #moreThreshold = 3;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/threadCardTags.css";
    shadowRoot.appendChild(style);

    for (let i = 0; i < ThreadCardTags.#moreThreshold; i++) {
      const img = new Image();
      img.classList.add("tag-icon");
      img.src = "";
      img.alt = "";
      img.hidden = true;
      shadowRoot.append(img);
    }

    this.#more = document.createElement("span");
    this.#more.classList.add("tag-more");
    this.#more.hidden = true;

    shadowRoot.append(this.#more);
    this.#images = shadowRoot.querySelectorAll("img");

    // Update the DOM in case we already have tags applied to the element.
    this.#setData();
  }

  attributeChangedCallback(attribute, oldValue, newValue) {
    // No need to do anything if the element didn't connect yet, another
    // attribute other than tags was changed, or the old and new values match.
    if (!this.shadowRoot || attribute !== "tags" || oldValue === newValue) {
      return;
    }
    this.#setData();
  }

  /**
   * Set the tag data and show tags if we have any.
   */
  #setData() {
    // Always clear any stale UI.
    for (const tag of this.#images) {
      tag.hidden = true;
    }
    this.#more.hidden = true;
    this.title = "";

    const tags = this.getAttribute("tags")
      ?.split(" ")
      .filter(tagKey => MailServices.tags.isValidKey(tagKey));
    // No need to do anything else if we don't have any tags to show.
    if (!tags?.length) {
      return;
    }

    // Show or hide tags based on their index and the amount of tags.
    for (const [index, key] of tags
      .slice(0, ThreadCardTags.#moreThreshold)
      .entries()) {
      const img = this.#images[index];
      img.hidden = false;
      // If any tag is active, we reset the tags colors.
      img.style.setProperty(
        "--tag-color",
        `var(--tag-${CSS.escape(key)}-backcolor)`
      );
    }

    this.title = tagsTitleFormatter.format(
      tags.map(key => MailServices.tags.getTagForKey(key))
    );

    // Updates the text span displaying the extra amount of the tags.
    if (tags.length > ThreadCardTags.#moreThreshold) {
      this.#more.hidden = false;
      this.#more.textContent = tagsMoreFormatter.format(
        tags.length - ThreadCardTags.#moreThreshold
      );
    }
  }
}
customElements.define("thread-card-tags", ThreadCardTags);

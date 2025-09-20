/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Create a circular avatar representing the initial letter of the user or
 * showing an image in case we're able to fetch a picture associated with the
 * provided email address.
 * This custom element accepts both an nsIABCard and a string depending if
 * we're trying to generate an avatar for existing contacts or a new recipient
 * currently not saved in our address book.
 *
 * @tagname contact-avatar
 */
class ContactAvatar extends HTMLElement {
  /** @type {HTMLSpanElement} */
  #letters;

  /** @type {HTMLImageElement} */
  #image;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/contactAvatar.css";
    shadowRoot.appendChild(style);

    // Connect fluent strings.
    window.MozXULElement?.insertFTLIfNeeded("messenger/contact-avatar.ftl");
    document.l10n.connectRoot(shadowRoot);

    this.#letters = document.createElement("span");
    this.#letters.ariaHidden = true;
    this.#letters.hidden = true;

    this.#image = new Image();
    this.#image.src = "";
    this.#image.alt = "";
    this.#image.hidden = true;
    shadowRoot.append(this.#letters, this.#image);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  /**
   * Update the visualization of the contact avatar based on which data we get.
   *
   * @param {object} [options={}] - Options.
   * @param {?nsIAbCard} [options.card] - The address book card.
   * @param {string} [options.recipient=""] - The recipient name or email if not
   *   currently available in the address book.
   */
  setData({ card, recipient = "" } = {}) {
    if (!this.shadowRoot) {
      console.error("Trying to set data too early!");
      return;
    }

    // Always start on a clean state.
    this.#letters.textContent = "";
    this.#letters.hidden = true;
    this.#image.src = "";
    this.#image.removeAttribute("data-l10n-id");
    this.removeAttribute("class");

    if (card?.isMailList) {
      this.#image.hidden = false;
      this.classList.add("is-mail-list");
      return;
    }

    const photoURL = card?.photoURL;
    if (photoURL) {
      this.#image.src = photoURL;
      this.#image.hidden = false;

      document.l10n.setAttributes(this.#image, "avatar-picture-alt-text", {
        address: card.primaryEmail,
      });
      return;
    }

    // If we reached this point it means we don't have an available picture and
    // we should fill up the avatar with placeholder text.
    // We temporarily check for `card.name` and `card.email` because our mail
    // list implementation doesn't properly use nsIABCard but a custom subset of
    // it. We will update this later.
    this.#letters.textContent =
      Array.from(
        (
          card?.displayName ||
          card?.primaryEmail ||
          card?.name ||
          card?.email ||
          recipient
        )
          ?.normalize()
          .replaceAll(/[^\p{Letter}\p{Nd}]+/gu, "")
      )[0]?.toUpperCase() || "";
    this.#letters.hidden = false;
  }
}
customElements.define("contact-avatar", ContactAvatar);

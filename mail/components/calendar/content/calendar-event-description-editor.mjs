/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import Squire from "moz-src:///comm/third_party/squire/squire-raw.mjs";
import {
  descriptionLinkURL,
  parseDescriptionHTML,
} from "./calendar-event-description-format.mjs";

const toggleFormats = {
  bold: ["B", "removeBold"],
  italic: ["I", "removeItalic"],
  strikethrough: ["S", "removeStrikethrough"],
  makeUnorderedList: ["UL", "removeList"],
  makeOrderedList: ["OL", "removeList"],
};

/**
 * Restores Squire history outside the privileged editor document.
 */
class DescriptionSquire extends Squire {
  /**
   * Restores an internal history snapshot with Squire's cursor fixups.
   *
   * @param {string} html - The snapshot recorded by this editor.
   * @returns {DescriptionSquire} This editor.
   */
  _setRawHTML(html) {
    const root = this.getRoot();
    const historyDocument = new DOMParser().parseFromString("", "text/html");
    const historyRoot = historyDocument.importNode(root, false);

    // History contains Squire's hidden selection inputs. Parsing a snapshot in
    // the privileged document asserts in debug builds and drops the inputs in
    // release builds. Only internal history uses this inert document; loaded
    // and pasted HTML still gets sanitized.
    this._root = historyRoot;

    try {
      // This method is synchronous and emits no events. Keep its cursor
      // fixups and mutation handling, then restore the live root before use.
      super._setRawHTML(html);
    } finally {
      this._root = root;
    }

    root.replaceChildren(...historyRoot.childNodes);

    return this;
  }
}

/**
 * Edits one Description draft in the packaged HTML frame.
 *
 * @tagname calendar-description-editor
 */
class CalendarDescriptionEditor extends HTMLElement {
  /**
   * The editable text area.
   *
   * @type {HTMLDivElement|undefined}
   */
  #input;

  /**
   * The formatting controls above the text area.
   *
   * @type {HTMLDivElement|undefined}
   */
  #toolbar;

  /**
   * The modal popup for the link form.
   *
   * @type {HTMLDialogElement|undefined}
   */
  #linkPopup;

  /**
   * The form used to add or edit a link.
   *
   * @type {HTMLFormElement|undefined}
   */
  #linkForm;

  /**
   * The link address input.
   *
   * @type {HTMLInputElement|undefined}
   */
  #address;

  /**
   * The link selected when the link form opens, if present.
   *
   * @type {HTMLAnchorElement|null|undefined}
   */
  #editingLink = null;

  /**
   * The Squire instance, or null after the editor is destroyed.
   *
   * @type {Squire|null|undefined}
   */
  #engine;

  /**
   * Receives changed HTML while the editor session is active.
   *
   * @type {((html: string) => void)|null|undefined}
   */
  #onChange;

  /**
   * The last document received from or sent to the event draft.
   *
   * @type {?string}
   */
  #lastDocument = null;
  #loadedDocument = "";
  #loadedHTML = "";

  connectedCallback() {
    this.#input = this.querySelector(".description-input");
    this.#toolbar = this.querySelector(".description-formatting");
    this.#linkPopup = this.querySelector(".description-link-popup");
    this.#linkForm = this.#linkPopup.querySelector("form");
    this.#address = this.#linkForm.querySelector("input");
    this.#engine = new DescriptionSquire(this.#input, {
      addLinks: false,
      /**
       * Parses HTML and removes `data-l10n-id` attributes.
       * Removes the `squire-image-resize-container` class.
       *
       * @param {string} html - The HTML to load or paste.
       * @returns {DocumentFragment} The sanitized content for Squire.
       */
      sanitizeToDOMFragment: html => {
        const fragment = parseDescriptionHTML(html, document);

        // Keep pasted markup from activating localization or image controls.
        for (const node of fragment.querySelectorAll("[data-l10n-id]")) {
          delete node.dataset.l10nId;
        }
        for (const node of fragment.querySelectorAll(
          ".squire-image-resize-container"
        )) {
          node.classList.remove("squire-image-resize-container");
        }

        return fragment;
      },
    });

    // Squire looks up selection markers by ID in the editable content.
    const bookmarkId = `squire-${crypto.randomUUID()}`;
    this.#engine.startSelectionId = `${bookmarkId}-start`;
    this.#engine.endSelectionId = `${bookmarkId}-end`;

    this.addEventListener("click", this);
    this.addEventListener("submit", this);
    this.addEventListener("input", this);
    this.addEventListener("blur", this, true);
    this.#linkPopup.addEventListener("close", this);
    document.addEventListener("dragover", this);
    document.addEventListener("drop", this);
    for (const type of ["cursor", "select"]) {
      this.#engine.addEventListener(type, event => {
        this.#updateFormatting(event.detail.range);
      });
    }

    this.#engine.addEventListener("undoStateChange", event => {
      const { canUndo, canRedo } = event.detail;

      this.#toolbar.querySelector('[data-format="undo"]').disabled = !canUndo;
      this.#toolbar.querySelector('[data-format="redo"]').disabled = !canRedo;
    });
  }

  disconnectedCallback() {
    this.destroy();
  }

  /**
   * Sends editor changes to the current event draft.
   *
   * @param {(html: string) => void} onChange - Receives the draft HTML.
   */
  setChangeHandler(onChange) {
    this.#onChange = onChange;
    // Connect after load so localization does not mark the draft dirty.
    this.#engine.addEventListener("input", () => this.#emitChange());
  }

  /**
   * Loads a draft unless the editor already produced that value. An echo of
   * user input must keep the current selection and undo history.
   *
   * @param {string} html - The serializable editor document.
   */
  setDocument(html) {
    if (html == this.#lastDocument) {
      return;
    }

    this.#lastDocument = html;
    this.#loadedDocument = html;
    this.#engine.setHTML(html);
    this.#loadedHTML = this.#engine.getHTML();
    this.#toolbar.querySelector('[data-format="undo"]').disabled = true;
    this.#toolbar.querySelector('[data-format="redo"]').disabled = true;
  }

  /**
   * Moves focus to the editable area.
   */
  focus() {
    this.#engine.focus();
  }

  /**
   * Disconnects Squire and stops sending updates to the dialog.
   */
  destroy() {
    this.#onChange = null;
    this.#engine?.destroy();
    this.#engine = null;
    document.removeEventListener("dragover", this);
    document.removeEventListener("drop", this);
  }

  /**
   * Sends changed HTML to the draft. Empty text clears the Description.
   * If Undo restores the loaded HTML, sends the original document value.
   */
  #emitChange() {
    const html = this.#engine.getHTML();
    const text = this.#input.textContent.replaceAll("\u200b", "").trim();

    let description = text ? html : "";

    // Squire normalizes the loaded HTML. If Undo restores it, send the
    // original value so the draft becomes clean again.
    if (html == this.#loadedHTML) {
      description = this.#loadedDocument;
    }

    if (description == this.#lastDocument) {
      return;
    }

    this.#lastDocument = description;
    this.#onChange?.(description);
  }

  /**
   * Updates toolbar pressed states from the selected text.
   *
   * @param {Range} range - The current editor selection.
   */
  #updateFormatting(range) {
    const node = range.commonAncestorContainer;
    const element =
      node.nodeType == Node.ELEMENT_NODE ? node : node.parentElement;
    const list = element?.closest("ol, ul");

    for (const button of this.#toolbar.querySelectorAll(
      "button[aria-pressed]"
    )) {
      const [tag] = toggleFormats[button.dataset.format];
      button.ariaPressed = String(
        tag == "UL" || tag == "OL"
          ? list?.tagName == tag
          : this.#engine.hasFormat(tag)
      );
    }
  }

  /**
   * Applies the button's formatting command or opens or closes the link form.
   *
   * @param {HTMLButtonElement} button - The activated formatting control.
   */
  #runCommand(button) {
    const command = button.dataset.format;

    switch (command) {
      case "link": {
        const range = this.#engine.getSelection();
        const startNode = range.startContainer;
        const startElement =
          startNode.nodeType == Node.ELEMENT_NODE
            ? startNode
            : startNode.parentElement;
        const link = startElement?.closest("a");

        this.#editingLink = link;
        this.#address.value = link?.getAttribute("href") ?? "";
        this.#address.setCustomValidity("");
        this.#linkPopup.showModal();

        return;
      }
      case "removeLink":
        this.#selectLink();
        this.#engine.removeLink();
      // Fall through to close the link form.
      case "cancelLink":
        this.#linkPopup.close();

        return;
    }

    const method =
      button.ariaPressed == "true" ? toggleFormats[command][1] : command;

    this.#engine[method]();
    this.focus();
  }

  /**
   * Selects the edited link's contents if the link remains in the editor.
   */
  #selectLink() {
    if (this.#input.contains(this.#editingLink)) {
      const range = document.createRange();
      range.selectNodeContents(this.#editingLink);
      this.#engine.setSelection(range);
    }
  }

  handleEvent(event) {
    if (!this.#engine) {
      return;
    }

    switch (event.type) {
      case "blur":
        if (event.target == this.#input) {
          // Capture the selection before Squire marks its input as unfocused.
          this.#engine.getSelection();
        }
        break;
      case "close":
        // The popup can reopen before the close event arrives.
        if (!this.#linkPopup.open) {
          this.#editingLink = null;
          this.focus();
        }
        break;
      case "click": {
        const button = event.target.closest("button[data-format]");
        if (this.#toolbar.contains(button) || this.#linkForm.contains(button)) {
          this.#runCommand(button);
        } else if (event.target.closest("a")) {
          event.preventDefault();
        }
        break;
      }
      case "input":
        if (event.target == this.#address) {
          this.#address.setCustomValidity("");
        }
        break;
      case "submit": {
        event.preventDefault();
        const url = descriptionLinkURL(this.#address.value);

        if (!url) {
          document.l10n
            .formatValue("calendar-description-invalid-link")
            .then(message => {
              if (
                this.#engine &&
                this.#linkPopup.open &&
                !descriptionLinkURL(this.#address.value)
              ) {
                this.#address.setCustomValidity(message);
                this.#address.reportValidity();
              }
            });
          return;
        }

        this.#selectLink();
        this.#engine.makeLink(url);
        this.#linkPopup.close();
        break;
      }
      case "dragover":
      case "drop":
        // Squire handles text and HTML drops. Cancel the browser's default
        // action so other drops cannot navigate the frame or insert content.
        event.preventDefault();
        break;
    }
  }
}

customElements.define("calendar-description-editor", CalendarDescriptionEditor);

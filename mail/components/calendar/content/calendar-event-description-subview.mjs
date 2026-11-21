/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalendarDialogSubview } from "./calendar-dialog-subview.mjs";
import { calendarEventSessionRow } from "./calendar-event-session-row.mjs";
import { selectDescriptionDocument } from "./state/calendar-event-create-edit-selectors.mjs";
import { updateSection } from "./state/calendarEventDraftSlice.mjs";

/**
 * Loads the Description editor and connects it to the event draft.
 *
 * Template ID: #calendarDialogSubviewTemplate
 *
 * @tagname calendar-event-description-subview
 * @slot main - The Description heading and editor region.
 */
class CalendarEventDescriptionSubview extends calendarEventSessionRow(
  CalendarDialogSubview,
  forSession => ({ description: forSession(selectDescriptionDocument) })
) {
  /**
   * The focusable region that contains the editor frame.
   *
   * @type {HTMLDivElement|undefined}
   */
  #editorRegion;

  /**
   * The frame for the current editor session.
   *
   * @type {?HTMLIFrameElement}
   */
  #frame = null;

  /**
   * The editor loaded inside the current frame.
   *
   * @type {?CalendarDescriptionEditor}
   */
  #editor = null;

  /**
   * The selected Description, or null when the draft is cleared.
   *
   * @type {?string}
   */
  #description = null;

  connectedCallback() {
    super.connectedCallback();

    this.#editorRegion = this.querySelector("#descriptionEditor");
    this.#editorRegion.addEventListener("focus", this);
  }

  disconnectedCallback() {
    this.#editorRegion.removeEventListener("focus", this);
    this.#removeEditor();
    super.disconnectedCallback();
  }

  handleEvent(event) {
    if (event.type == "focus") {
      this.#openEditor();

      return;
    }

    super.handleEvent(event);
  }

  /**
   * Loads the current Description into the editor. Clearing the draft closes
   * the editor session.
   *
   * @param {string} _fieldName - The registered selector name.
   * @param {string|null|undefined} _previous - The previous Description, or
   *   undefined on the first update.
   * @param {?string} description - The current Description, or null when cleared.
   */
  handleStateChange(_fieldName, _previous, description) {
    this.#description = description;

    if (description === null) {
      this.#removeEditor();

      return;
    }

    this.#editor?.setDocument(description);
  }

  /**
   * Focuses the current editor, or loads it in an HTML frame. Squire needs an
   * HTML document to edit text inside the XHTML dialog.
   */
  #openEditor() {
    if (this.#frame) {
      this.#editor?.focus();

      return;
    }

    const doc = this.ownerDocument;
    const region = this.#editorRegion;
    const frame = doc.createElement("iframe");

    frame.classList.add("calendar-description-frame");
    doc.l10n.setAttributes(frame, "calendar-description-frame");
    frame.src = "chrome://messenger/content/eventDescriptionEditor.html";

    frame.addEventListener(
      "load",
      () => {
        if (frame !== this.#frame) {
          return;
        }

        const editor = frame.contentDocument.querySelector(
          "calendar-description-editor"
        );

        this.#editor = editor;
        editor.setChangeHandler(description => {
          this.dispatchSessionAction(updateSection, {
            patch: { description },
            section: "description",
          });
        });
        editor.setDocument(this.#description);

        // The user can move focus while the frame loads.
        if (
          frame === this.#frame &&
          this.ownerDocument.activeElement === region
        ) {
          editor.focus();
        }
      },
      { once: true, capture: true }
    );

    this.#frame = frame;
    region.classList.add("has-description-frame");
    region.append(frame);
  }

  /**
   * Ends the editor session and invalidates any pending load.
   */
  #removeEditor() {
    const frame = this.#frame;

    if (!frame) {
      return;
    }

    this.#frame = null;
    this.#editor?.destroy();
    this.#editor = null;
    frame.remove();
    this.#editorRegion.classList.remove("has-description-frame");
  }
}

customElements.define(
  "calendar-event-description-subview",
  CalendarEventDescriptionSubview
);

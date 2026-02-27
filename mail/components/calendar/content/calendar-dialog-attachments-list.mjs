/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import CalendarDialogAttachment from "./calendar-dialog-attachment.mjs";
import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * @typedef {object} AttachmentStub
 * @property {string} uri - The URI of the attachment.
 * @property {string} [icon] - An optional string pointing to an icon to
 *   represent the attached file.
 */

/**
 * A calendar dialog read row for a subview that lists all attachments of an
 * event.
 *
 * Template ID: #calendarDialogAttachmentsListTemplate
 *
 * @tagname calendar-dialog-attachments-list
 */
class CalendarDialogAttachmentsList extends HTMLElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogAttachmentsListTemplate")
      .content.cloneNode(true);
    this.append(template);
  }

  /**
   * Show the given attachments in the list of this row. Should only be called
   * once the element has connected to the DOM.
   *
   * @param {AttachmentStub[]} attachments - The attachments to display in the
   *   subview.
   */
  setAttachments(attachments) {
    this.querySelector(".attachments-list").replaceChildren(
      ...attachments.map(attachmentData => {
        const attachment = new CalendarDialogAttachment();
        attachment.setAttribute("label", attachmentData.uri);
        attachment.setAttribute("url", attachmentData.uri);
        attachment.setAttribute("icon", attachmentData.icon || "");
        return attachment;
      })
    );
  }
}

customElements.define(
  "calendar-dialog-attachments-list",
  CalendarDialogAttachmentsList
);

/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Generate the URL for an icon representing the file of a calendar event
 * attachment. Tries to determine the file type by the file extension or if
 * provided an explicit mime type and then generates the special moz-icon URI
 * for it. The exception are cloud file/FileLink attachments, where we prefer to
 * show the service icon if we don't have a mime type for the attachment. That's
 * because the attachment willthen  often point at a web page to download the
 * file instead of a direct link to a file.
 *
 * @param {calIAttachment} attachment - The attachment to get an icon URL for.
 * @returns {string} Typically a moz-icon URI without any get parameters. If the attachment is stored with cloudfile, returns the cloud file icon.
 */
export function getAttachmentIcon(attachment) {
  if (!attachment.uri || attachment.uri.spec == "about:blank") {
    return "";
  }

  let iconSrc = attachment.uri.spec || "dummy.html";
  if (!attachment.uri.schemeIs("file")) {
    // Using an URI directly, with e.g. a http scheme, wouldn't render any icon.
    if (attachment.formatType) {
      iconSrc = "goat?contentType=" + attachment.formatType;
    } else if (attachment.getParameter("X-SERVICE-ICONURL")) {
      return attachment.getParameter("X-SERVICE-ICONURL");
    } else {
      // Let's try to auto-detect.
      const parts = iconSrc.slice(attachment.uri.scheme.length + 2).split("/");
      iconSrc = parts.at(-1) || "dummy.html";
    }
  }
  return `moz-icon://${iconSrc}`;
}

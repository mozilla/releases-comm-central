/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Create a body part with attachments for the message generator
 *
 * @param body the text of the main body of the message
 * @param attachments an array of attachment objects (as strings)
 * @param boundary an optional string defining the boundary of the parts
 * @returns an object suitable for passing as the |bodyPart| for create_message
 */
export function create_body_part(body, attachments, boundary) {
  if (!boundary) {
    boundary = "------------CHOPCHOP";
  }

  return {
    contentTypeHeaderValue: 'multipart/mixed;\r\n boundary="' + boundary + '"',
    toMessageString() {
      let str =
        "This is a multi-part message in MIME format.\r\n" +
        "--" +
        boundary +
        "\r\n" +
        "Content-Type: text/plain; charset=ISO-8859-1; " +
        "format=flowed\r\n" +
        "Content-Transfer-Encoding: 7bit\r\n\r\n" +
        body +
        "\r\n\r\n";

      for (let i = 0; i < attachments.length; i++) {
        str += "--" + boundary + "\r\n" + attachments[i] + "\r\n";
      }

      str += "--" + boundary + "--";
      return str;
    },
  };
}

function help_create_detached_deleted_attachment(filename, type) {
  return (
    "You deleted an attachment from this message. The original MIME " +
    "headers for the attachment were:\r\n" +
    "Content-Type: " +
    type +
    ";\r\n" +
    ' name="' +
    filename +
    '"\r\n' +
    "Content-Transfer-Encoding: 7bit\r\n" +
    "Content-Disposition: attachment;\r\n" +
    ' filename="' +
    filename +
    '"\r\n\r\n'
  );
}

/**
 * Create the raw data for a detached attachment
 *
 * @param file an nsIFile for the external file for the attachment
 * @param type the content type
 * @returns a string representing the attachment
 */
export function create_detached_attachment(file, type) {
  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  const url = fileHandler.getURLSpecFromActualFile(file);
  const filename = file.leafName;

  let str =
    'Content-Type: text/plain;\r\n name="' +
    filename +
    '"\r\n' +
    'Content-Disposition: attachment; filename="' +
    filename +
    '"\r\n' +
    "X-Mozilla-External-Attachment-URL: " +
    url +
    "\r\n" +
    'X-Mozilla-Altered: AttachmentDetached; date="' +
    'Wed Oct 06 17:28:24 2010"\r\n\r\n';

  str += help_create_detached_deleted_attachment(filename, type);
  return str;
}

/**
 * Create the raw data for a deleted attachment
 *
 * @param filename the "original" filename
 * @param type the content type
 * @returns a string representing the attachment
 */
export function create_deleted_attachment(filename, type) {
  let str =
    'Content-Type: text/x-moz-deleted; name="Deleted: ' +
    filename +
    '"\r\n' +
    "Content-Transfer-Encoding: 8bit\r\n" +
    'Content-Disposition: inline; filename="Deleted: ' +
    filename +
    '"\r\n' +
    'X-Mozilla-Altered: AttachmentDeleted; date="' +
    'Wed Oct 06 17:28:24 2010"\r\n\r\n';
  str += help_create_detached_deleted_attachment(filename, type);
  return str;
}

/**
 * Create the raw data for a feed enclosure attachment.
 *
 * @param filename the filename
 * @param type the content type
 * @param url the remote link url
 * @param size the optional size (use > 1 for real size)
 * @returns a string representing the attachment
 */
export function create_enclosure_attachment(filename, type, url, size) {
  return (
    "Content-Type: " +
    type +
    '; name="' +
    filename +
    (size ? '"; size=' + size : '"') +
    "\r\n" +
    "X-Mozilla-External-Attachment-URL: " +
    url +
    "\r\n" +
    'Content-Disposition: attachment; filename="' +
    filename +
    '"\r\n\r\n' +
    "This MIME attachment is stored separately from the message."
  );
}

/**
 * A helper function that selects either one, or a continuous range
 * of items in the attachment list.
 *
 * @param {Window} aWin - A composer window.
 * @param {integer} aIndexStart - The index of the first item to select.
 * @param {integer} [aIndexEnd] - The index of the last item to select.
 */
export function select_attachments(aWin, aIndexStart, aIndexEnd) {
  const bucket = aWin.document.getElementById("attachmentBucket");
  bucket.clearSelection();

  if (aIndexEnd !== undefined) {
    const startItem = bucket.getItemAtIndex(aIndexStart);
    const endItem = bucket.getItemAtIndex(aIndexEnd);
    bucket.selectItemRange(startItem, endItem);
  } else {
    bucket.selectedIndex = aIndexStart;
  }

  bucket.focus();
  return [...bucket.selectedItems];
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

var { MAILBOX_HEADERS, parseEncodedAddrHeader } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionMessages.sys.mjs"
);

var parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
  Ci.nsIParserUtils
);

this.messengerUtilities = class extends ExtensionAPIPersistent {
  getAPI() {
    const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    return {
      messengerUtilities: {
        async formatFileSize(sizeInBytes) {
          return messenger.formatFileSize(sizeInBytes);
        },
        async parseMailboxString(addrString, preserveGroups) {
          return MailServices.headerParser
            .parseDecodedHeader(addrString, preserveGroups)
            .map(hdr => ({
              name: hdr.name || undefined,
              group: hdr.group || undefined,
              email: hdr.email || undefined,
            }));
        },
        async convertToPlainText(body, options) {
          let wrapWidth = 0;
          let flags =
            Ci.nsIDocumentEncoder.OutputLFLineBreak |
            Ci.nsIDocumentEncoder.OutputDisallowLineBreaking;

          if (options?.flowed) {
            wrapWidth = 72;
            flags |=
              Ci.nsIDocumentEncoder.OutputFormatted |
              Ci.nsIDocumentEncoder.OutputFormatFlowed;
          }

          return parserUtils.convertToPlainText(body, flags, wrapWidth).trim();
        },
        async decodeMimeHeader(headerName, headerValue, isMailBoxHeader) {
          // MAILBOX_HEADERS is all lowercase.
          headerName = headerName.toLowerCase();
          // Return an array, even for single values.
          if (!Array.isArray(headerValue)) {
            headerValue = [headerValue];
          }

          if (isMailBoxHeader ?? MAILBOX_HEADERS.includes(headerName)) {
            return headerValue.map(value =>
              parseEncodedAddrHeader(value).join(", ")
            );
          }

          return headerValue.map(value =>
            MailServices.mimeConverter.decodeMimeHeader(
              MailStringUtils.stringToByteString(value),
              null,
              false /* override_charset */,
              true /* eatContinuations */
            )
          );
        },
        async encodeMimeHeader(headerName, headerValue, isMailBoxHeader) {
          // MAILBOX_HEADERS is all lowercase.
          headerName = headerName.toLowerCase();
          // Return an array, even for single values.
          if (!Array.isArray(headerValue)) {
            headerValue = [headerValue];
          }

          return headerValue.map(value =>
            MailServices.mimeConverter.encodeMimePartIIStr_UTF8(
              value,
              isMailBoxHeader ?? MAILBOX_HEADERS.includes(headerName),
              headerName.length + 2,
              Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
            )
          );
        },
      },
    };
  }
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
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
      },
    };
  }
};

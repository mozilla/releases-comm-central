/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.messengerUtilities = class extends ExtensionAPIPersistent {
  getAPI(context) {
    const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    return {
      messengerUtilities: {
        async formatFileSize(sizeInBytes) {
          return messenger.formatFileSize(sizeInBytes);
        },
      },
    };
  }
};

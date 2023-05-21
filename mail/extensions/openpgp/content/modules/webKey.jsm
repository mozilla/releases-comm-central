/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * This module serves to integrate WKS (Webkey service) into Enigmail
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailWks"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
});

var EnigmailWks = {
  wksClientPath: null,

  /**
   * Get WKS Client path (gpg-wks-client)
   *
   * @param window  : Object - parent window for dialog display
   * @param cb      : Function(retValue) - callback function.
   *                   retValue: nsIFile Object to gpg-wks-client executable or NULL
   * @returns : Object - NULL or a process handle
   */
  getWksClientPathAsync(window, cb) {
    lazy.EnigmailLog.DEBUG("webKey.jsm: getWksClientPathAsync\n");
    throw new Error("Not implemented");
  },

  /**
   * Determine if WKS is supported by email provider
   *
   * @param email : String - user's email address
   * @param window: Object - parent window of dialog display
   * @param cb    : Function(retValue) - callback function.
   *                   retValue: Boolean: true if WKS is supported / false otherwise
   * @returns : Object - process handle
   */
  isWksSupportedAsync(email, window, cb) {
    lazy.EnigmailLog.DEBUG(
      "webKey.jsm: isWksSupportedAsync: email = " + email + "\n"
    );
    throw new Error("Not implemented");
  },

  /**
   * Submit a set of keys to the Web Key Server (WKD)
   *
   * @param keys:     Array of KeyObj
   * @param win:      parent Window for displaying dialogs
   * @param observer: Object (KeySrvListener API)
   *     Object implementing:
   *    - onProgress: function(percentComplete) [only implemented for download()]
   *     - onCancel: function() - the body will be set by the callee
   *
   * @returns Promise<...>
   */
  wksUpload(keys, win, observer = null) {
    lazy.EnigmailLog.DEBUG(`webKey.jsm: wksUpload(): keys = ${keys.length}\n`);
    let ids = getWkdIdentities(keys);

    if (observer === null) {
      observer = {
        onProgress() {},
      };
    }

    observer.isCanceled = false;
    observer.onCancel = function () {
      this.isCanceled = true;
    };

    if (!ids) {
      throw new Error("error");
    }

    if (ids.senderIdentities.length === 0) {
      return new Promise(resolve => {
        resolve([]);
      });
    }

    return performWkdUpload(ids.senderIdentities, win, observer);
  },

  /**
   * Submit a key to the email provider (= send publication request)
   *
   * @param ident : nsIMsgIdentity - user's ID
   * @param key   : Enigmail KeyObject of user's key
   * @param window: Object - parent window of dialog display
   * @param cb    : Function(retValue) - callback function.
   *                   retValue: Boolean: true if submit was successful / false otherwise
   * @returns : Object - process handle
   */

  submitKey(ident, key, window, cb) {
    lazy.EnigmailLog.DEBUG(
      "webKey.jsm: submitKey(): email = " + ident.email + "\n"
    );
    throw new Error("Not implemented");
  },

  /**
   * Submit a key to the email provider (= send publication request)
   *
   * @param ident : nsIMsgIdentity - user's ID
   * @param body  : String -  complete message source of the confirmation-request email obtained
   *                    from the email provider
   * @param window: Object - parent window of dialog display
   * @param cb    : Function(retValue) - callback function.
   *                   retValue: Boolean: true if submit was successful / false otherwise
   * @returns : Object - process handle
   */

  confirmKey(ident, body, window, cb) {
    lazy.EnigmailLog.DEBUG(
      "webKey.jsm: confirmKey: ident=" + ident.email + "\n"
    );
    throw new Error("Not implemented");
  },
};

/**
 * Check if a file exists and is executable
 *
 * @param path:         String - directory name
 * @param execFileName: String - executable name
 *
 * @returns Object - nsIFile if file exists; NULL otherwise
 */

function getWkdIdentities(keys) {
  lazy.EnigmailLog.DEBUG(
    `webKey.jsm: getWkdIdentities(): keys = ${keys.length}\n`
  );
  let senderIdentities = [],
    notFound = [];

  for (let key of keys) {
    try {
      let found = false;
      for (let uid of key.userIds) {
        let email = lazy.EnigmailFuncs.stripEmail(uid.userId).toLowerCase();
        let identity = MailServices.accounts.allIdentities.find(
          id => id.email?.toLowerCase() == email
        );

        if (identity) {
          senderIdentities.push({
            identity,
            fpr: key.fpr,
          });
        }
      }
      if (!found) {
        notFound.push(key);
      }
    } catch (ex) {
      lazy.EnigmailLog.DEBUG(ex + "\n");
      return null;
    }
  }

  return {
    senderIdentities,
    notFound,
  };
}

/**
 * Do the WKD upload and interact with a progress receiver
 *
 * @param keyList:     Object:
 *                       - fprList (String - fingerprint)
 *                       - senderIdentities (nsIMsgIdentity)
 * @param win:         nsIWindow - parent window
 * @param observer:    Object:
 *                       - onProgress: function(percentComplete [0 .. 100])
 *                             called after processing of every key (independent of status)
 *                       - onUpload: function(fpr)
 *                              called after successful uploading of a key
 *                       - onFinished: function(completionStatus, errorMessage, displayError)
 *                       - isCanceled: Boolean - used to determine if process is canceled
 */
function performWkdUpload(keyList, win, observer) {
  lazy.EnigmailLog.DEBUG(
    `webKey.jsm: performWkdUpload: keyList.length=${keyList.length}\n`
  );

  let uploads = [];

  let numKeys = keyList.length;

  // For each key fpr/sender identity pair, check whenever WKS is supported
  // Result is an array of booleans
  for (let i = 0; i < numKeys; i++) {
    let keyFpr = keyList[i].fpr;
    let senderIdent = keyList[i].identity;

    let was_uploaded = new Promise(function (resolve, reject) {
      lazy.EnigmailLog.DEBUG(
        "webKey.jsm: performWkdUpload: _isSupported(): ident=" +
          senderIdent.email +
          ", key=" +
          keyFpr +
          "\n"
      );
      EnigmailWks.isWksSupportedAsync(
        senderIdent.email,
        win,
        function (is_supported) {
          if (observer.isCanceled) {
            lazy.EnigmailLog.DEBUG(
              "webKey.jsm: performWkdUpload: canceled by user\n"
            );
            reject("canceled");
          }

          lazy.EnigmailLog.DEBUG(
            "webKey.jsm: performWkdUpload: ident=" +
              senderIdent.email +
              ", supported=" +
              is_supported +
              "\n"
          );
          resolve(is_supported);
        }
      );
    }).then(function (is_supported) {
      lazy.EnigmailLog.DEBUG(
        `webKey.jsm: performWkdUpload: _submitKey ${is_supported}\n`
      );
      if (is_supported) {
        return new Promise(function (resolve, reject) {
          EnigmailWks.submitKey(
            senderIdent,
            {
              fpr: keyFpr,
            },
            win,
            function (success) {
              observer.onProgress(((i + 1) / numKeys) * 100);
              if (success) {
                resolve(senderIdent);
              } else {
                reject("submitFailed");
              }
            }
          );
        });
      }

      observer.onProgress(((i + 1) / numKeys) * 100);
      return Promise.resolve(null);
    });

    uploads.push(was_uploaded);
  }

  return Promise.all(uploads)
    .catch(function (reason) {
      //let errorMsg = "Could not upload your key to the Web Key Service";
      return [];
    })
    .then(function (senders) {
      let uploaded_uids = [];
      if (senders) {
        senders.forEach(function (val) {
          if (val !== null) {
            uploaded_uids.push(val.email);
          }
        });
      }
      observer.onProgress(100);

      return uploaded_uids;
    });
}

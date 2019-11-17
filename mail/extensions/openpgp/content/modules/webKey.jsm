/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint no-invalid-this: 0 */

/**
 * This module serves to integrate WKS (Webkey service) into Enigmail
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailWks"];





const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailGpgAgent = ChromeUtils.import("chrome://openpgp/content/modules/gpgAgent.jsm").EnigmailGpgAgent;
const EnigmailStdlib = ChromeUtils.import("chrome://openpgp/content/modules/stdlib.jsm").EnigmailStdlib;
const EnigmailSend = ChromeUtils.import("chrome://openpgp/content/modules/send.jsm").EnigmailSend;
const EnigmailMimeEncrypt = ChromeUtils.import("chrome://openpgp/content/modules/mimeEncrypt.jsm").EnigmailMimeEncrypt;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;

const GPG_WKS_CLIENT = "gpg-wks-client";

var EnigmailWks = {
  wksClientPath: null,

  /**
   * Get WKS Client path (gpg-wks-client)
   *
   * @param window  : Object - parent window for dialog display
   * @param cb      : Function(retValue) - callback function.
   *                   retValue: nsIFile Object to gpg-wks-client executable or NULL
   * @return        : Object - NULL or a process handle
   */
  getWksClientPathAsync: function(window, cb) {
    EnigmailLog.DEBUG("webKey.jsm: getWksClientPathAsync\n");

    if (EnigmailWks.wksClientPath === null) {
      let listener = EnigmailExecution.newSimpleListener(null, function(ret) {
        if (ret === 0) {
          try {
            let stdout = listener.stdoutData;

            let libexecdir = /^libexecdir:(.+?)$/m.exec(stdout)[1];
            if (libexecdir) {
              libexecdir = libexecdir.replace(/%3a/gi, ":");
            }
            else {
              libexecdir = "";
            }

            let wks_client = checkIfExists(libexecdir, GPG_WKS_CLIENT);
            if (!wks_client) {
              let bindir = /^bindir:(.+?)$/m.exec(stdout)[1];
              if (bindir) {
                bindir = bindir.replace(/%3a/gi, ":");
              }
              else {
                bindir = "";
              }
              wks_client = checkIfExists(bindir, GPG_WKS_CLIENT);

              if (!wks_client) {
                cb(null);
                return;
              }
            }

            EnigmailWks.wksClientPath = wks_client;
            cb(wks_client);
          }
          catch (e) {
            EnigmailLog.DEBUG("webKey.jsm: getWksClientPathAsync: " + e.toString() + "\n");
            cb(null);
          }
        }
        else {
          cb(null);
        }
      });

      return EnigmailExecution.execStart(EnigmailGpgAgent.gpgconfPath, ["--list-dirs"], false, window, listener, {
        value: null
      });
    }
    else {
      cb(EnigmailWks.wksClientPath);
      return null;
    }
  },

  /**
   * Determine if WKS is supported by email provider
   *
   * @param email : String - user's email address
   * @param window: Object - parent window of dialog display
   * @param cb    : Function(retValue) - callback function.
   *                   retValue: Boolean: true if WKS is supported / false otherwise
   * @return      : Object - process handle
   */
  isWksSupportedAsync: function(email, window, cb) {
    EnigmailLog.DEBUG("webKey.jsm: isWksSupportedAsync: email = " + email + "\n");
    return EnigmailWks.getWksClientPathAsync(window, function(wks_client) {
      if (wks_client === null) {
        cb(false);
      }
      let listener = EnigmailExecution.newSimpleListener(null, function(ret) {
        cb(ret === 0);
      });
      let proc = EnigmailExecution.execStart(wks_client, ["--supported", email], false, window, listener, {
        value: null
      });
      if (proc === null) {
        cb(false);
      }
    });
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
   * @return Promise<...>
   */
  wksUpload: function(keys, win, observer = null) {
    EnigmailLog.DEBUG(`webKey.jsm: wksUpload(): keys = ${keys.length}\n`);
    let ids = getWkdIdentities(keys);

    if (observer === null) {
      observer = {
        onProgress: function() {}
      };
    }

    observer.isCanceled = false;
    observer.onCancel = function() {
      this.isCanceled = true;
    };

    if (!ids) throw "error";

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
   * @return      : Object - process handle
   */

  submitKey: function(ident, key, window, cb) {
    EnigmailLog.DEBUG("webKey.jsm: submitKey(): email = " + ident.email + "\n");
    return EnigmailWks.getWksClientPathAsync(window, function(wks_client) {
      if (wks_client === null) {
        cb(false);
        return null;
      }
      let listener = EnigmailExecution.newSimpleListener(null, function(ret) {
        if (ret !== 0) {
          cb(false);
          return;
        }
        EnigmailLog.DEBUG("webKey.jsm: submitKey: send " + listener.stdoutData + "\n");
        let si = EnigmailMimeEncrypt.createMimeEncrypt(null);
        let subject = listener.stdoutData.match(/^Subject:[ \t]*(.+)$/im);
        let to = listener.stdoutData.match(/^To:[ \t]*(.+)$/im);

        if (subject !== null && to !== null) {
          si.sendFlags = EnigmailConstants.SEND_VERBATIM;

          if (!EnigmailSend.simpleSendMessage({
                urls: [],
                identity: ident,
                to: to[1],
                subject: subject[1],
                composeSecure: si
              },
              listener.stdoutData,
              cb
            )) {
            cb(false);
          }
        }
        else {
          cb(false);
        }
      });
      return EnigmailExecution.execStart(wks_client, ["--create", key.fpr, ident.email], false, window, listener, {
        value: null
      });
    });
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
   * @return      : Object - process handle
   */

  confirmKey: function(ident, body, window, cb) {
    EnigmailLog.DEBUG("webKey.jsm: confirmKey: ident=" + ident.email + "\n");

    var sanitized = body.replace(/\r?\n/g, "\r\n");
    return EnigmailWks.getWksClientPathAsync(window, function(wks_client) {
      if (wks_client === null) {
        if (cb) {
          cb(false);
        }
        return;
      }
      let listener = EnigmailExecution.newSimpleListener(function(pipe) {
        try {
          pipe.write(sanitized);
          pipe.close();
        }
        catch (e) {
          if (cb) {
            cb(false);
          }
          EnigmailLog.DEBUG(e + "\n");
        }
      }, function(ret) {
        try {
          let si = EnigmailMimeEncrypt.createMimeEncrypt(null);
          let subject = listener.stdoutData.match(/^Subject:[ \t]*(.+)$/im);
          let to = listener.stdoutData.match(/^To:[ \t]*(.+)$/im);

          if (subject !== null && to !== null) {
            si.sendFlags = EnigmailConstants.SEND_VERBATIM;

            if (!EnigmailSend.simpleSendMessage({
                  urls: [],
                  identity: ident,
                  to: to[1],
                  subject: subject[1],
                  composeSecure: si
                },
                listener.stdoutData,
                cb
              )) {
              cb(false);
            }
          }
        }
        catch (e) {
          if (cb) {
            cb(false);
          }
          EnigmailLog.DEBUG(e + "\n");
        }
      });
      EnigmailExecution.execStart(wks_client, ["--receive"], false, window, listener, {
        value: null
      });
    });
  }
};

/**
 * Check if a file exists and is executable
 *
 * @param path:         String - directory name
 * @param execFileName: String - executable name
 *
 * @return Object - nsIFile if file exists; NULL otherwise
 */

function checkIfExists(path, execFileName) {
  EnigmailLog.DEBUG("webKey.jsm checkIfExists() path=" + path + " execFileName=" + execFileName + "\n");

  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);

  execFileName = EnigmailFiles.potentialWindowsExecutable(execFileName);
  EnigmailFiles.initPath(file, path);
  file.append(execFileName);
  if (file.exists() && file.isExecutable()) {
    return file;
  }
  else {
    return null;
  }
}


function getWkdIdentities(keys) {
  EnigmailLog.DEBUG(`webKey.jsm: getWkdIdentities(): keys = ${keys.length}\n`);
  let senderIdentities = [],
    notFound = [];

  for (let key of keys) {
    try {
      let found = false;
      for (let uid of key.userIds) {
        let email = EnigmailFuncs.stripEmail(uid.userId);
        let maybeIdent = EnigmailStdlib.getIdentityForEmail(email);

        if (maybeIdent && maybeIdent.identity) {
          senderIdentities.push({
            identity: maybeIdent.identity,
            fpr: key.fpr
          });
        }
      }
      if (!found) {
        notFound.push(key);
      }
    }
    catch (ex) {
      EnigmailLog.DEBUG(ex + "\n");
      return null;
    }
  }

  return {
    senderIdentities: senderIdentities,
    notFound
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
 *                             called after processing of every key (indpendent of status)
 *                       - onUpload: function(fpr)
 *                              called after successful uploading of a key
 *                       - onFinished: function(completionStatus, errorMessage, displayError)
 *                       - isCanceled: Boolean - used to determine if process is canceled
 */
function performWkdUpload(keyList, win, observer) {
  EnigmailLog.DEBUG(`webKey.jsm: performWkdUpload: keyList.length=${keyList.length}\n`);

  let uploads = [];

  let numKeys = keyList.length;

  // For each key fpr/sender identity pair, check whenever WKS is supported
  // Result is an array of booleans
  for (let i = 0; i < numKeys; i++) {
    let keyFpr = keyList[i].fpr;
    let senderIdent = keyList[i].identity;

    let was_uploaded = new Promise(function _isSupported(resolve, reject) {
      EnigmailLog.DEBUG("webKey.jsm: performWkdUpload: _isSupported(): ident=" + senderIdent.email + ", key=" + keyFpr + "\n");
      EnigmailWks.isWksSupportedAsync(senderIdent.email, win, function(is_supported) {
        if (observer.isCanceled) {
          EnigmailLog.DEBUG("webKey.jsm: performWkdUpload: canceled by user\n");
          reject("canceled");
        }

        EnigmailLog.DEBUG("webKey.jsm: performWkdUpload: ident=" + senderIdent.email + ", supported=" + is_supported + "\n");
        resolve(is_supported);
      });
    }).then(function _submitKey(is_supported) {
      EnigmailLog.DEBUG(`webKey.jsm: performWkdUpload: _submitKey ${is_supported}\n`);
      if (is_supported) {

        return new Promise(function(resolve, reject) {
          EnigmailWks.submitKey(senderIdent, {
            'fpr': keyFpr
          }, win, function(success) {
            observer.onProgress((i + 1) / numKeys * 100);
            if (success) {
              resolve(senderIdent);
            }
            else {
              reject("submitFailed");
            }
          });
        });
      }
      else {
        observer.onProgress((i + 1) / numKeys * 100);
        return Promise.resolve(null);
      }
    });

    uploads.push(was_uploaded);
  }

  return Promise.all(uploads).catch(function(reason) {
    //let errorMsg = EnigmailLocale.getString("keyserverProgress.wksUploadFailed");
    return [];
  }).then(function(senders) {
    let uploaded_uids = [];
    if (senders) {
      senders.forEach(function(val) {
        if (val !== null) {
          uploaded_uids.push(val.email);
        }
      });
    }
    observer.onProgress(100);

    return uploaded_uids;
  });
}

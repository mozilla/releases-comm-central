/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;


/**
 * opens a prompt, asking the user to enter passphrase for given key id
 * returns: the passphrase if entered (empty string is allowed)
 * resultFlags.canceled is set to true if the user clicked cancel
 */
function passphrasePromptCallback(win, keyId, resultFlags) {
  let p = {};
  p.value = "";
  let dummy = {};
  if (!Services.prompt.promptPassword(win,
    "",
    EnigmailLocale.getString("passphrasePrompt", [keyId]),
    p,
    null,
    dummy)) {
    resultFlags.canceled = true;
    return "";
  }

  resultFlags.canceled = false;
  return p.value;
}

/**
 * import OpenPGP keys from file
 */
function EnigmailCommon_importKeysFromFile(secret) {
  let inFile = EnigmailDialog.filePicker(
    window,
    EnigmailLocale.getString("importKeyFile"),
    "",
    false,
    "*.asc",
    "",
    [EnigmailLocale.getString("gnupgFile"), "*.asc;*.gpg;*.pgp"]
  );
  if (!inFile) {
    return false;
  }

  let errorMsgObj = {};
  // preview
  let preview = EnigmailKey.getKeyListFromKeyFile(inFile, errorMsgObj, !secret, secret);

  if (errorMsgObj.value && errorMsgObj.value.length > 0) {
    EnigmailDialog.alert(window, errorMsgObj.value);
    return false;
  }
  let exitStatus = -1;

  if (preview.length > 0) {
    if (preview.length == 1) {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportOne", [
          preview[0].name,
          preview[0].id,
        ])
      );
    } else {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportMultiple", [
          preview
            .map(function(a) {
              return "\t" + a.name + " (" + a.id + ")";
            })
            .join("\n"),
        ])
      );
    }

    if (exitStatus) {
      // import
      let resultKeys = {};
      let exitCode = EnigmailKeyRing.importKeyFromFile(window, passphrasePromptCallback, inFile, errorMsgObj, resultKeys, !secret, secret);
      if (exitCode !== 0) {
        EnigmailDialog.alert(
          window,
          EnigmailLocale.getString("importKeysFailed") +
            "\n\n" +
            errorMsgObj.value
        );
      } else {
        console.debug("import final resultKeys: %o", resultKeys.keys);
        EnigmailDialog.keyImportDlg(window, resultKeys.keys);
        return true;
      }
    }
  }

  return false;
}

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var { EnigmailCore } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/core.sys.mjs"
);
var { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);

var l10nCommon = new Localization(["messenger/openpgp/openpgp.ftl"], true);

async function EnigRevokeKey(keyObj, callbackFunc) {
  EnigmailCore.init();

  if (keyObj.keyTrust == "r") {
    Services.prompt.alert(
      null,
      document.title,
      l10nCommon.formatValueSync("already-revoked")
    );
    return;
  }

  const promptFlags =
    Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
    Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;

  const confirm = Services.prompt.confirmEx(
    window,
    l10nCommon.formatValueSync("openpgp-key-revoke-title"),
    l10nCommon.formatValueSync("revoke-key-question", {
      identity: `0x${keyObj.keyId} - ${keyObj.userId}`,
    }),
    promptFlags,
    l10nCommon.formatValueSync("key-man-button-revoke-key"),
    null,
    null,
    null,
    {}
  );

  if (confirm != 0) {
    return;
  }

  await RNP.revokeKey(keyObj.fpr);
  callbackFunc(true);

  Services.prompt.alert(
    null,
    l10nCommon.formatValueSync("openpgp-key-revoke-success"),
    l10nCommon.formatValueSync("after-revoke-info")
  );
}

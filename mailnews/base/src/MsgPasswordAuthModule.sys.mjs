/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "authPromptService",
  "@mozilla.org/messenger/msgAuthPrompt;1",
  Ci.nsIAuthPrompt
);

/**
 * @implements {msgIPasswordAuthModule}
 */
export class MsgPasswordAuthModule {
  QueryInterface = ChromeUtils.generateQI(["msgIPasswordAuthModule"]);

  cachedPassword;

  queryPasswordFromUserAndCache(
    username,
    hostname,
    localStoreType,
    promptMessage,
    promptTitle,
    password
  ) {
    if (this.cachedPassword) {
      return this.cachedPassword;
    }

    // Let's see if we have the password in the password manager and
    // can avoid this prompting thing. This makes it easier to get embedders
    // to get up and running w/o a password prompting UI.

    this.queryPasswordFromManagerAndCache(username, hostname, localStoreType);
    if (this.cachedPassword) {
      return this.cachedPassword;
    }

    // Otherwise, prompt the user for the password.

    let serverUri = localStoreType + "://";
    if (username) {
      const escapedUsername = Services.io.escapeString(
        username,
        Ci.nsINetUtil.ESCAPE_XALPHAS
      );
      serverUri += escapedUsername + "@";
    }
    serverUri += hostname;

    // We pass in the previously used password, if any, into promptPassword so
    // that it will appear as ******.
    const passwordObj = { value: password };
    if (
      !lazy.authPromptService.promptPassword(
        promptTitle,
        promptMessage,
        serverUri,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        passwordObj
      )
    ) {
      throw new Components.Exception(
        "User cancelled password prompt",
        Cr.NS_ERROR_ABORT
      );
    }

    // We got a password back... so remember it.
    this.cachedPassword = passwordObj.value;
    return passwordObj.value;
  }

  // This sets cachedPassword if we find a password in the manager.
  queryPasswordFromManagerAndCache(username, hostname, localStoreType) {
    let finished = false;
    this.#queryPasswordFromManagerAndCacheInternal(
      username,
      hostname,
      localStoreType
    ).finally(() => (finished = true));
    Services.tm.spinEventLoopUntilOrQuit(
      "MsgPasswordAuthModule.queryPasswordFromManagerAndCache",
      () => finished
    );
  }

  async #queryPasswordFromManagerAndCacheInternal(
    username,
    hostname,
    localStoreType
  ) {
    // Get the current server URI.
    const serverUri = localStoreType + "://" + hostname;

    const logins = await Services.logins.searchLoginsAsync({
      origin: serverUri,
      httpRealm: serverUri,
    });
    for (const login of logins) {
      if (login.username == username) {
        this.cachedPassword = login.password;
        return login.password;
      }
    }

    return "";
  }

  forgetPassword(username, hostname, localStoreType) {
    let finished = false;
    this.#forgetPasswordInternal(username, hostname, localStoreType).finally(
      () => (finished = true)
    );
    Services.tm.spinEventLoopUntilOrQuit(
      "MsgPasswordAuthModule.forgetPassword",
      () => finished
    );
  }

  async #forgetPasswordInternal(username, hostname, localStoreType) {
    const serverUri = localStoreType + "://" + hostname;
    const logins = await Services.logins.searchLoginsAsync({
      origin: serverUri,
      httpRealm: serverUri,
    });

    // There should only be one-login stored for this url, however just in case
    // there isn't.
    for (const login of logins) {
      const loginUsername = login.username;
      if (
        loginUsername == username ||
        loginUsername == username.slice(0, username.indexOf("@"))
      ) {
        // If this fails, just continue, we'll still want to remove the password
        // from our local cache.
        await Services.logins.removeLoginAsync(login);
      }
    }

    this.cachedPassword = "";
  }

  forgetSessionPassword() {
    this.cachedPassword = "";
  }
}

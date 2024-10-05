/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  "nsILoginInfo",
  "init"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Deprecated: "resource://gre/modules/Deprecated.sys.mjs",
  PromptUtils: "resource://gre/modules/PromptUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "dialogsBundle", function () {
  return Services.strings.createBundle(
    "chrome://global/locale/commonDialogs.properties"
  );
});

ChromeUtils.defineLazyGetter(lazy, "brandFullName", function () {
  return Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandFullName");
});

function runnablePrompter(asyncPrompter, hashKey) {
  this._asyncPrompter = asyncPrompter;
  this._hashKey = hashKey;
}

runnablePrompter.prototype = {
  _asyncPrompter: null,
  _hashKey: null,

  _promiseAuthPrompt(listener) {
    return new Promise((resolve, reject) => {
      try {
        listener.onPromptStartAsync({ onAuthResult: resolve });
      } catch (e) {
        if (e.result == Cr.NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED) {
          // Fall back to onPromptStart, for add-ons compat
          lazy.Deprecated.warning(
            "onPromptStart has been replaced by onPromptStartAsync",
            "https://bugzilla.mozilla.org/show_bug.cgi?id=1176399"
          );
          const ok = listener.onPromptStart();
          resolve(ok);
        } else {
          reject(e);
        }
      }
    });
  },

  async run() {
    await Services.logins.initializationPromise;
    this._asyncPrompter._log.debug("Running prompt for " + this._hashKey);
    const prompter = this._asyncPrompter._pendingPrompts[this._hashKey];
    let ok = false;
    try {
      ok = await this._promiseAuthPrompt(prompter.first);
    } catch (ex) {
      console.error("runnablePrompter:run: ", ex);
      prompter.first.onPromptCanceled();
    }

    delete this._asyncPrompter._pendingPrompts[this._hashKey];

    for (var consumer of prompter.consumers) {
      try {
        if (ok) {
          consumer.onPromptAuthAvailable();
        } else {
          consumer.onPromptCanceled();
        }
      } catch (ex) {
        // Log the error for extension devs and others to pick up.
        console.error(
          "runnablePrompter:run: consumer.onPrompt* reported an exception: ",
          ex
        );
      }
    }
    this._asyncPrompter._asyncPromptInProgress--;

    this._asyncPrompter._log.debug(
      "Finished running prompter for " + this._hashKey
    );
    this._asyncPrompter._doAsyncAuthPrompt();
  },
};

export function MsgAsyncPrompter() {
  this._pendingPrompts = {};
  // By default, only log warnings to the error console
  // You can use the preference:
  //   msgAsyncPrompter.loglevel
  // To change this up.  Values should be one of:
  //   Fatal/Error/Warn/Info/Config/Debug/Trace/All
  this._log = console.createInstance({
    prefix: "mail.asyncprompter",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.asyncprompter.loglevel",
  });
}

MsgAsyncPrompter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgAsyncPrompter"]),

  _pendingPrompts: null,
  _asyncPromptInProgress: 0,
  _log: null,

  queueAsyncAuthPrompt(aKey, aJumpQueue, aCaller) {
    if (aKey in this._pendingPrompts) {
      this._log.debug(
        "Prompt bound to an existing one in the queue, key: " + aKey
      );
      this._pendingPrompts[aKey].consumers.push(aCaller);
      return;
    }

    this._log.debug("Adding new prompt to the queue, key: " + aKey);
    const asyncPrompt = {
      first: aCaller,
      consumers: [],
    };

    this._pendingPrompts[aKey] = asyncPrompt;
    if (aJumpQueue) {
      this._asyncPromptInProgress++;

      this._log.debug("Forcing runnablePrompter for " + aKey);

      const runnable = new runnablePrompter(this, aKey);
      Services.tm.mainThread.dispatch(runnable, Ci.nsIThread.DISPATCH_NORMAL);
    } else {
      this._doAsyncAuthPrompt();
    }
  },

  _doAsyncAuthPrompt() {
    if (this._asyncPromptInProgress > 0) {
      this._log.debug(
        "_doAsyncAuthPrompt bypassed - prompt already in progress"
      );
      return;
    }

    // Find the first prompt key we have in the queue.
    let hashKey = null;
    for (hashKey in this._pendingPrompts) {
      break;
    }

    if (!hashKey) {
      return;
    }

    this._asyncPromptInProgress++;

    this._log.debug("Dispatching runnablePrompter for " + hashKey);

    const runnable = new runnablePrompter(this, hashKey);
    Services.tm.mainThread.dispatch(runnable, Ci.nsIThread.DISPATCH_NORMAL);
  },
};

/**
 * An implementation of nsIAuthPrompt which is roughly the same as
 * LoginManagerAuthPrompter was before the check box option was removed from
 * nsIPromptService.
 *
 * Calls our own version of promptUsernameAndPassword/promptPassword, which
 * directly open the prompt.
 *
 * @implements {nsIAuthPrompt}
 */
export class MsgAuthPrompt {
  QueryInterface = ChromeUtils.generateQI(["nsIAuthPrompt"]);

  static l10n = new Localization(["messenger/msgAuthPrompt.ftl"], true);

  _getFormattedOrigin(aURI) {
    let uri;
    if (aURI instanceof Ci.nsIURI) {
      uri = aURI;
    } else {
      uri = Services.io.newURI(aURI);
    }

    return uri.scheme + "://" + uri.displayHostPort;
  }

  _getRealmInfo(aRealmString) {
    const httpRealm = /^.+ \(.+\)$/;
    if (httpRealm.test(aRealmString)) {
      return [null, null, null];
    }

    const uri = Services.io.newURI(aRealmString);
    let pathname = "";

    if (uri.pathQueryRef != "/") {
      pathname = uri.pathQueryRef;
    }

    const formattedOrigin = this._getFormattedOrigin(uri);

    return [formattedOrigin, formattedOrigin + pathname, uri.username];
  }

  /**
   * Wrapper around the prompt service prompt. Saving random fields here
   * doesn't really make sense and therefore isn't implemented.
   */
  prompt(
    aDialogTitle,
    aText,
    aPasswordRealm,
    aSavePassword,
    aDefaultText,
    aResult
  ) {
    if (aSavePassword != Ci.nsIAuthPrompt.SAVE_PASSWORD_NEVER) {
      throw new Components.Exception(
        "prompt only supports SAVE_PASSWORD_NEVER",
        Cr.NS_ERROR_NOT_IMPLEMENTED
      );
    }

    if (aDefaultText) {
      aResult.value = aDefaultText;
    }

    return Services.prompt.prompt(
      this._chromeWindow,
      aDialogTitle,
      aText,
      aResult,
      null,
      {}
    );
  }

  /**
   * Looks up a username and password in the database. Will prompt the user
   * with a dialog, even if a username and password are found.
   */
  promptUsernameAndPassword(
    aDialogTitle,
    aText,
    aPasswordRealm,
    aSavePassword,
    aUsername,
    aPassword
  ) {
    if (aSavePassword == Ci.nsIAuthPrompt.SAVE_PASSWORD_FOR_SESSION) {
      throw new Components.Exception(
        "promptUsernameAndPassword doesn't support SAVE_PASSWORD_FOR_SESSION",
        Cr.NS_ERROR_NOT_IMPLEMENTED
      );
    }

    const checkBox = { value: false };
    let checkBoxLabel = null;
    const [origin, realm] = this._getRealmInfo(aPasswordRealm);

    // If origin is null, we can't save this login.
    if (origin) {
      const canRememberLogin =
        aSavePassword == Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY &&
        Services.logins.getLoginSavingEnabled(origin);

      // if checkBoxLabel is null, the checkbox won't be shown at all.
      if (canRememberLogin) {
        checkBoxLabel = MsgAuthPrompt.l10n.formatValueSync(
          "remember-password-checkbox-label"
        );
      }

      for (const login of Services.logins.findLogins(origin, null, realm)) {
        if (login.username == aUsername.value) {
          checkBox.value = true;
          aUsername.value = login.username;
          // If the caller provided a password, prefer it.
          if (!aPassword.value) {
            aPassword.value = login.password;
          }
        }
      }
    }

    const ok = nsIPrompt_promptUsernameAndPassword(
      aDialogTitle,
      aText,
      aUsername,
      aPassword,
      checkBoxLabel,
      checkBox
    );

    if (!ok || !checkBox.value || !origin) {
      return ok;
    }

    const newLogin = new LoginInfo(
      origin,
      null,
      realm,
      aUsername.value,
      aPassword.value
    );
    Services.logins.addLoginAsync(newLogin);
    Services.tm.spinEventLoopUntilEmpty();

    return ok;
  }

  /**
   * If a password is found in the database for the password realm, it is
   * returned straight away without displaying a dialog.
   *
   * If a password is not found in the database, the user will be prompted
   * with a dialog with a text field and ok/cancel buttons. If the user
   * allows it, then the password will be saved in the database.
   */
  promptPassword(
    aDialogTitle,
    aText,
    aPasswordRealm,
    aSavePassword,
    aPassword
  ) {
    if (aSavePassword == Ci.nsIAuthPrompt.SAVE_PASSWORD_FOR_SESSION) {
      throw new Components.Exception(
        "promptUsernameAndPassword doesn't support SAVE_PASSWORD_FOR_SESSION",
        Cr.NS_ERROR_NOT_IMPLEMENTED
      );
    }

    const checkBox = { value: false };
    let checkBoxLabel = null;
    let [origin, realm, username] = this._getRealmInfo(aPasswordRealm);

    username = decodeURIComponent(username);

    // If origin is null, we can't save this login.
    if (origin) {
      const canRememberLogin =
        aSavePassword == Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY &&
        Services.logins.getLoginSavingEnabled(origin);

      // if checkBoxLabel is null, the checkbox won't be shown at all.
      if (canRememberLogin) {
        checkBoxLabel = MsgAuthPrompt.l10n.formatValueSync(
          "remember-password-checkbox-label"
        );
      }

      if (!aPassword.value) {
        // Look for existing logins.
        for (const login of Services.logins.findLogins(origin, null, realm)) {
          if (login.username == username) {
            aPassword.value = login.password;
            return true;
          }
        }
      }
    }

    const ok = nsIPrompt_promptPassword(
      aDialogTitle,
      aText,
      aPassword,
      checkBoxLabel,
      checkBox
    );

    if (ok && checkBox.value && origin && aPassword.value) {
      const newLogin = new LoginInfo(
        origin,
        null,
        realm,
        username,
        aPassword.value
      );

      Services.logins.addLoginAsync(newLogin);
      Services.tm.spinEventLoopUntilEmpty();
    }

    return ok;
  }

  /**
   * Implements nsIPrompt.promptPassword as it was before the check box option
   * was removed.
   *
   * Puts up a dialog with a password field and an optional, labelled checkbox.
   *
   * @param {string} dialogTitle - Text to appear in the title of the dialog.
   * @param {string} text - Text to appear in the body of the dialog.
   * @param {?object} password - Contains the default value for the password
   *   field when this method is called (null value is ok).
   *   Upon return, if the user pressed OK, then this parameter contains a
   *   newly allocated string value.
   *   Otherwise, the parameter's value is unmodified.
   * @param {?string} checkMsg - Text to appear with the checkbox.  If null,
   *   check box will not be shown.
   * @param {?object} checkValue - Contains the initial checked state of the
   *   checkbox when this method is called and the final checked state after
   *   this method returns.
   *
   * @returns {boolean} true for OK, false for Cancel.
   */
  promptPassword2(dialogTitle, text, password, checkMsg, checkValue) {
    return nsIPrompt_promptPassword(
      dialogTitle,
      text,
      password,
      checkMsg,
      checkValue
    );
  }

  /**
   * Requests a username and a password. Implementations will commonly show a
   * dialog with a username and password field, depending on flags also a
   * domain field.
   *
   * @param {nsIChannel} channel - The channel that requires authentication.
   * @param {number} level - One of the level constants from nsIAuthPrompt2.
   *   See there for descriptions of the levels.
   * @param {nsIAuthInformation} authInfo - Authentication information object.
   *   The implementation should fill in this object with the information
   *   entered by the user before returning.
   * @param {string} checkboxLabel
   *        Text to appear with the checkbox.  If null, check box will not be shown.
   * @param {object} checkValue
   *        Contains the initial checked state of the checkbox when this method
   *        is called and the final checked state after this method returns.
   * @returns {boolean} true for OK, false for Cancel.
   */
  promptAuth(channel, level, authInfo, checkboxLabel, checkValue) {
    const title = lazy.dialogsBundle.formatStringFromName(
      "PromptUsernameAndPassword3",
      [lazy.brandFullName]
    );
    const text = lazy.dialogsBundle.formatStringFromName(
      "EnterUserPasswordFor2",
      [`${channel.URI.scheme}://${channel.URI.host}`]
    );

    const username = { value: authInfo.username || "" };
    const password = { value: authInfo.password || "" };

    const ok = nsIPrompt_promptUsernameAndPassword(
      title,
      text,
      username,
      password,
      checkboxLabel,
      checkValue
    );

    if (ok) {
      authInfo.username = username.value;
      authInfo.password = password.value;
    }

    return ok;
  }
}

/**
 * @param {string} dialogTitle - Text to appear in the title of the dialog.
 * @param {string} text - Text to appear in the body of the dialog.
 * @param {?object} username
 *   Contains the default value for the username field when this method
 *   is called (null value is ok). Upon return, if the user pressed OK,
 *   then this parameter contains a newly allocated string value.
 * @param {?object} password - Contains the default value for the password
 *   field when this method is called (null value is ok).
 *   Upon return, if the user pressed OK, then this parameter contains a
 *   newly allocated string value.
 *   Otherwise, the parameter's value is unmodified.
 * @param {?string} checkMsg - Text to appear with the checkbox. If null,
 *   check box will not be shown.
 * @param {?object} checkValue - Contains the initial checked state of the
 *   checkbox when this method is called and the final checked state after
 *   this method returns.
 * @returns {boolean} true for OK, false for Cancel.
 */
function nsIPrompt_promptUsernameAndPassword(
  dialogTitle,
  text,
  username,
  password,
  checkMsg,
  checkValue
) {
  if (!dialogTitle) {
    dialogTitle = lazy.dialogsBundle.formatStringFromName(
      "PromptUsernameAndPassword3",
      [lazy.brandFullName]
    );
  }

  const args = {
    promptType: "promptUserAndPass",
    title: dialogTitle,
    text,
    user: username.value,
    pass: password.value,
    checkLabel: checkMsg,
    checked: checkValue.value,
    ok: false,
  };

  const propBag = lazy.PromptUtils.objectToPropBag(args);
  Services.ww.openWindow(
    Services.ww.activeWindow,
    "chrome://global/content/commonDialog.xhtml",
    "_blank",
    "centerscreen,chrome,modal,titlebar",
    propBag
  );
  lazy.PromptUtils.propBagToObject(propBag, args);

  // Did user click Ok or Cancel?
  const ok = args.ok;
  if (ok) {
    checkValue.value = args.checked;
    username.value = args.user;
    password.value = args.pass;
  }

  return ok;
}

/**
 * Implements nsIPrompt.promptPassword as it was before the check box option
 * was removed.
 *
 * Puts up a dialog with a password field and an optional, labelled checkbox.
 *
 * @param {string} dialogTitle - Text to appear in the title of the dialog.
 * @param {string} text - Text to appear in the body of the dialog.
 * @param {?object} password - Contains the default value for the password
 *   field when this method is called (null value is ok).
 *   Upon return, if the user pressed OK, then this parameter contains a
 *   newly allocated string value.
 *   Otherwise, the parameter's value is unmodified.
 * @param {?string} checkMsg - Text to appear with the checkbox. If null,
 *   check box will not be shown.
 * @param {?object} checkValue - Contains the initial checked state of the
 *   checkbox when this method is called and the final checked state after
 *   this method returns.
 *
 * @returns {boolean} true for OK, false for Cancel.
 */
function nsIPrompt_promptPassword(
  dialogTitle,
  text,
  password,
  checkMsg,
  checkValue
) {
  if (!dialogTitle) {
    dialogTitle = lazy.dialogsBundle.formatStringFromName(
      "PromptUsernameAndPassword3",
      [lazy.brandFullName]
    );
  }

  const args = {
    promptType: "promptPassword",
    title: dialogTitle,
    text,
    pass: password.value,
    checkLabel: checkMsg,
    checked: checkValue.value,
    ok: false,
  };

  const propBag = lazy.PromptUtils.objectToPropBag(args);
  Services.ww.openWindow(
    Services.ww.activeWindow,
    "chrome://global/content/commonDialog.xhtml",
    "_blank",
    "centerscreen,chrome,modal,titlebar",
    propBag
  );
  lazy.PromptUtils.propBagToObject(propBag, args);

  // Did user click Ok or Cancel?
  const ok = args.ok;
  if (ok) {
    checkValue.value = args.checked;
    password.value = args.pass;
  }

  return ok;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MsgAuthPrompt: "resource:///modules/MsgAsyncPrompter.sys.mjs",
  OAuth2Module: "resource:///modules/OAuth2Module.sys.mjs",
});

/**
 * A session for the caldav provider. Two or more calendars can share a session if they have the
 * same auth credentials.
 */
export class CalDavSession {
  QueryInterface = ChromeUtils.generateQI(["nsIInterfaceRequestor"]);

  /**
   * Creates a new caldav session
   *
   * @param {string} aUserName - The username associated with this session.
   */
  constructor(aUserName) {
    this.username = aUserName;
  }

  /**
   * Implement nsIInterfaceRequestor. The base class has no extra interfaces, but a subclass of
   * the session may.
   *
   * @param {nsIIDRef} aIID - The IID of the interface being requested
   * @returns {?*} Either this object QI'd to the IID, or null.
   *                                Components.returnCode is set accordingly.
   */
  getInterface(aIID) {
    try {
      // Try to query the this object for the requested interface but don't
      // throw if it fails since that borks the network code.
      return this.QueryInterface(aIID);
    } catch (e) {
      Components.returnCode = e;
    }

    return null;
  }

  /**
   * Prepare the channel for a request, e.g. setting custom authentication headers
   *
   * @param {nsIChannel} aChannel - The channel to prepare
   * @returns {Promise} A promise resolved when the preparations are complete
   */
  async prepareRequest(aChannel) {
    if (!("_oAuth" in this)) {
      for (const login of await Services.logins.searchLoginsAsync({
        origin: aChannel.URI.prePath,
      })) {
        // If we have a saved login, it might be a Fastmail user with an app password,
        // in which case we want to use it for authentication instead of OAuth2.
        if (login.username == this.username) {
          this._oAuth = null; // Use this saved login instead of OAuth.
          break;
        }
      }
    }
    // Set up oAuth. We could do this in the constructor but we need to have a hostname,
    // which is fine in the normal case but difficult when detecting calendars.
    if (!("_oAuth" in this)) {
      const oAuth = new lazy.OAuth2Module();
      if (oAuth.initFromHostname(aChannel.URI.host, this.username, "caldav")) {
        this._oAuth = oAuth;
        this._oAuthOrigin = aChannel.URI.prePath;
      } else {
        this._oAuth = null; // Prevents this block from running again.
      }
    }
    // The token is only for the server it was obtained for.
    if (this._oAuth && aChannel.URI.prePath == this._oAuthOrigin) {
      const deferred = Promise.withResolvers();
      this._oAuth.getAccessToken({
        onSuccess: deferred.resolve,
        onFailure: deferred.reject,
      });
      const accessToken = await deferred.promise;
      aChannel.setRequestHeader("Authorization", `Bearer ${accessToken}`, false);
    }
  }
}

/**
 * A session used to detect a caldav provider when subscribing to a network calendar.
 *
 * @implements {nsIAuthPrompt2}
 * @implements {nsIAuthPromptProvider}
 * @implements {nsIInterfaceRequestor}
 */
export class CalDavDetectionSession extends CalDavSession {
  QueryInterface = ChromeUtils.generateQI([
    Ci.nsIAuthPrompt2,
    Ci.nsIAuthPromptProvider,
    Ci.nsIInterfaceRequestor,
  ]);

  isDetectionSession = true;

  /**
   * The sites the password may be used for, as returned by
   * cal.provider.detection.getPasswordSite.
   *
   * @type {Set<string>}
   */
  passwordSites = new Set();

  /**
   * The sites where the user is asked for the password instead, as returned
   * by cal.provider.detection.getPasswordSite.
   *
   * @type {Set<string>}
   */
  promptSites = new Set();

  /**
   * The sites in promptSites where the user declined to give a password.
   *
   * @type {Set<string>}
   */
  declinedSites = new Set();

  /**
   * The credentials the user entered for sites in promptSites, by site,
   * whether the user chose to save them, and the origins and realms they have
   * been saved for.
   *
   * @type {Map<string, {username: string, password: string, save: boolean, savedFor: Set<string>}>}
   */
  #enteredCredentials = new Map();

  /**
   * Create a new caldav detection session.
   *
   * @param {string} aUserName - The username for the session.
   * @param {string} aPassword - The password for the session.
   * @param {boolean} aSavePassword - Whether to save the password.
   */
  constructor(aUserName, aPassword, aSavePassword) {
    super(aUserName);
    this.password = aPassword;
    this.savePassword = aSavePassword;
  }

  /**
   * Returns a plain (non-autodect) caldav session based on this session.
   *
   * @returns {CalDavSession} A caldav session.
   */
  toBaseSession() {
    return new CalDavSession(this.username);
  }

  /**
   * @see {nsIAuthPromptProvider}
   */
  getAuthPrompt(aReason, aIID) {
    try {
      return this.QueryInterface(aIID);
    } catch (e) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
    }
  }

  /**
   * @see {nsIAuthPrompt2}
   */
  asyncPromptAuth(aChannel, aCallback, aContext, aLevel, aAuthInfo) {
    setTimeout(() => {
      if (this.promptAuth(aChannel, aLevel, aAuthInfo)) {
        aCallback.onAuthAvailable(aContext, aAuthInfo);
      } else {
        aCallback.onAuthCancelled(aContext, true);
      }
    });
  }

  /**
   * Supplies the password for servers on a site in passwordSites, and asks the
   * user for servers on a site in promptSites.
   *
   * @see {nsIAuthPrompt2}
   * @param {nsIChannel} aChannel - The channel that requires authentication.
   * @param {integer} aLevel - The nsIAuthPrompt2 security level.
   * @param {nsIAuthInformation} aAuthInfo - Receives the credentials.
   * @returns {boolean} Whether there are credentials to use.
   */
  promptAuth(aChannel, aLevel, aAuthInfo) {
    // FIXME: Proxies that ask for Basic or Digest credentials can't be used
    // for detection. NTLM and Negotiate proxies are answered by necko with the
    // system credentials and never get here.
    if (!this.password || aAuthInfo.flags & Ci.nsIAuthInformation.AUTH_PROXY) {
      return false;
    }
    if (!cal.provider.detection.isPasswordSite(this.passwordSites, aChannel.URI)) {
      return (
        cal.provider.detection.isPasswordSite(this.promptSites, aChannel.URI) &&
        this.#promptForPassword(aChannel, aLevel, aAuthInfo)
      );
    }

    if ((aAuthInfo.flags & aAuthInfo.PREVIOUS_FAILED) == 0) {
      aAuthInfo.username = this.username;
      aAuthInfo.password = this.password;

      if (this.savePassword) {
        cal.auth.passwordManagerSave(
          this.username,
          this.password,
          aChannel.URI.prePath,
          aAuthInfo.realm
        );
      }
      return true;
    }

    aAuthInfo.username = null;
    aAuthInfo.password = null;
    if (this.savePassword) {
      cal.auth.passwordManagerRemove(this.username, aChannel.URI.prePath, aAuthInfo.realm);
    }
    return false;
  }

  /**
   * Asks the user for credentials for a server the password may not be sent
   * to without asking, and saves them if the user chooses to. The user is only
   * asked once per site, again if the credentials fail, and not again after
   * declining.
   *
   * Calendars found are set up with this.username, so if the user changes the
   * username, the login isn't saved here. The calendar then asks for the
   * password when it's first used, and saves the login with the username
   * entered then.
   *
   * @param {nsIChannel} channel - The channel that requires authentication.
   * @param {integer} level - The nsIAuthPrompt2 security level.
   * @param {nsIAuthInformation} authInfo - Receives the credentials.
   * @returns {boolean} Whether there are credentials to use.
   */
  #promptForPassword(channel, level, authInfo) {
    const site = cal.provider.detection.getPasswordSite(channel.URI);
    if (this.declinedSites.has(site)) {
      return false;
    }

    const entered = this.#enteredCredentials.get(site);
    if (authInfo.flags & authInfo.PREVIOUS_FAILED) {
      this.#enteredCredentials.delete(site);
      if (entered?.savedFor.delete(`${channel.URI.prePath} ${authInfo.realm}`)) {
        cal.auth.passwordManagerRemove(entered.username, channel.URI.prePath, authInfo.realm);
      }
    } else if (entered) {
      authInfo.username = entered.username;
      authInfo.password = entered.password;
      this.#saveEntered(entered, channel.URI.prePath, authInfo.realm);
      return true;
    }

    authInfo.username = entered?.username ?? this.username;
    authInfo.password = "";
    let savePasswordLabel = null;
    const savePassword = { value: this.savePassword };
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savePasswordLabel = lazy.MsgAuthPrompt.l10n.formatValueSync(
        "remember-password-checkbox-label"
      );
    }
    if (
      !new lazy.MsgAuthPrompt().promptAuth(
        channel,
        level,
        authInfo,
        savePasswordLabel,
        savePassword
      )
    ) {
      this.declinedSites.add(site);
      return false;
    }

    const newEntry = {
      username: authInfo.username,
      password: authInfo.password,
      save: !!(savePasswordLabel && savePassword.value && authInfo.username == this.username),
      savedFor: new Set(),
    };
    this.#enteredCredentials.set(site, newEntry);
    this.#saveEntered(newEntry, channel.URI.prePath, authInfo.realm);
    return true;
  }

  /**
   * Saves credentials from #enteredCredentials for an origin and realm, if the
   * user chose to save them and they haven't been saved for it yet.
   *
   * @param {{username: string, password: string, save: boolean, savedFor: Set<string>}} entered
   *   The entry in #enteredCredentials.
   * @param {string} origin - The origin to save the login for.
   * @param {string} realm - The realm to save the login for.
   */
  #saveEntered(entered, origin, realm) {
    const key = `${origin} ${realm}`;
    if (!entered.save || entered.savedFor.has(key)) {
      return;
    }
    entered.savedFor.add(key);
    cal.auth.passwordManagerSave(entered.username, entered.password, origin, realm);
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
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
    // Set up oAuth. We could do this in the constructor but we need to have a hostname,
    // which is fine in the normal case but difficult when detecting calendars.
    if (!("_oAuth" in this)) {
      const oAuth = new lazy.OAuth2Module();
      if (oAuth.initFromHostname(aChannel.URI.host, this.username, "caldav")) {
        this._oAuth = oAuth;
      } else {
        this._oAuth = null; // Prevents this block from running again.
      }
    }
    if (this._oAuth) {
      const deferred = Promise.withResolvers();
      this._oAuth.getAccessToken({
        onSuccess: deferred.resolve,
        onFailure: deferred.reject,
      });
      const accessToken = await deferred.promise;
      aChannel.setRequestHeader("Authorization", `Bearer ${accessToken}`, false);
    }
  }

  /**
   * Prepare the given new channel for a redirect, e.g. copying headers.
   *
   * @param {nsIChannel} aOldChannel - The old channel that is being redirected
   * @param {nsIChannel} aNewChannel - The new channel to prepare
   * @returns {Promise} A promise resolved when the preparations are complete
   */
  async prepareRedirect(aOldChannel, aNewChannel) {
    try {
      const hdrValue = aOldChannel.getRequestHeader("Authorization");
      if (hdrValue) {
        aNewChannel.setRequestHeader("Authorization", hdrValue, false);
      }
    } catch (e) {
      if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
        // The header could possibly not be available, ignore that
        // case but throw otherwise.
        throw e;
      }
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
   * @see {nsIAuthPrompt2}
   */
  promptAuth(aChannel, aLevel, aAuthInfo) {
    if (!this.password) {
      return false;
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
}

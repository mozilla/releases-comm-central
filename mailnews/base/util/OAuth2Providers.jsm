/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Details of supported OAuth2 Providers.
 */
var EXPORTED_SYMBOLS = ["OAuth2Providers"];

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

// map of hostnames to [issuer, scope]
var kHostnames = new Map([
  ["imap.googlemail.com", ["accounts.google.com", "https://mail.google.com/"]],
  ["smtp.googlemail.com", ["accounts.google.com", "https://mail.google.com/"]],
  ["imap.gmail.com", ["accounts.google.com", "https://mail.google.com/"]],
  ["smtp.gmail.com", ["accounts.google.com", "https://mail.google.com/"]],
]);

// map of issuers to appKey, appSecret, authURI, tokenURI

// For the moment, these details are hard-coded, since Google does not
// provide dynamic client registration. Don't copy these values for your
// own application--register it yourself. This code (and possibly even the
// registration itself) will disappear when this is switched to dynamic
// client registration.
var kIssuers = new Map ([
  ["accounts.google.com", [
    '406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com',
    'kSmqreRr0qwBWJgbf5Y-PjSU',
    'https://accounts.google.com/o/oauth2/auth',
    'https://www.googleapis.com/oauth2/v3/token'
  ]],
]);

/**
 *  OAuth2Providers: Methods to lookup OAuth2 parameters for supported
 *                   email providers.
 */
var OAuth2Providers = {

  /**
   * Map a hostname to the relevant issuer and scope.
   *
   * @param aHostname  String representing the url for an imap or smtp
   *                   server (example "imap.googlemail.com").
   *
   * @returns          Array with [issuer, scope] for the hostname if found,
   *                   else undefined. issuer is a string representing the
   *                   organization, scope is an oauth parameter describing\
   *                   the required access level.
   */
  getHostnameDetails: function (aHostname) { return kHostnames.get(aHostname);},

  /**
   * Map an issuer to OAuth2 account details.
   *
   * @param aIssuer    The organization issuing oauth2 parameters, example
   *                   "accounts.google.com".
   *
   * @return           Array containing [appKey, appSecret, authURI, tokenURI]
   *                   where appKey and appDetails are strings representing the
   *                   account registered for Thunderbird with the organization,
   *                   authURI and tokenURI are url strings representing
   *                   endpoints to access OAuth2 authentication.
   */
  getIssuerDetails: function (aIssuer) { return kIssuers.get(aIssuer);}
}

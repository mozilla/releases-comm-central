/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cleanUpHostName, isLegalHostNameOrIP } = ChromeUtils.importESModule(
  "resource:///modules/hostnameUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

var gSmtpServer;
var gSmtpUsername;
var gSmtpDescription;
var gSmtpUsernameLabel;
var gSmtpHostname;
var gSmtpPort;
var gSmtpAuthMethod;
var gSmtpSocketType;
var gPort;
var gDefaultPort;

window.addEventListener("DOMContentLoaded", onLoad);
document.addEventListener("dialogaccept", onAccept);

function onLoad() {
  gSmtpServer = window.arguments[0].server;
  initSmtpSettings(gSmtpServer);
}

function onAccept(event) {
  if (!isLegalHostNameOrIP(cleanUpHostName(gSmtpHostname.value))) {
    const prefsBundle = document.getElementById("bundle_prefs");
    const brandBundle = document.getElementById("bundle_brand");
    const alertTitle = brandBundle.getString("brandShortName");
    const alertMsg = prefsBundle.getString("enterValidServerName");
    Services.prompt.alert(window, alertTitle, alertMsg);

    window.arguments[0].result = false;
    event.preventDefault();
    return;
  }

  // If we didn't have an SMTP server to initialize with,
  // we must be creating one.
  try {
    if (!gSmtpServer) {
      gSmtpServer = MailServices.outgoingServer.createServer("smtp");
      window.arguments[0].addSmtpServer = gSmtpServer.key;
    }

    saveSmtpSettings(gSmtpServer);
  } catch (ex) {
    console.error("Error saving smtp server: " + ex);
  }

  window.arguments[0].result = true;
}

function initSmtpSettings(server) {
  gSmtpUsername = document.getElementById("smtpUsername");
  gSmtpDescription = document.getElementById("smtp.description");
  gSmtpUsernameLabel = document.getElementById("smtpUsernameLabel");
  gSmtpHostname = document.getElementById("smtp.hostname");
  gSmtpPort = document.getElementById("smtp.port");
  gSmtpAuthMethod = document.getElementById("smtp.authMethod");
  gSmtpSocketType = document.getElementById("smtp.socketType");
  gDefaultPort = document.getElementById("smtp.defaultPort");
  gPort = document.getElementById("smtp.port");

  if (server) {
    const smtpServer = server.QueryInterface(Ci.nsISmtpServer);
    gSmtpHostname.value = smtpServer.hostname;
    gSmtpDescription.value = server.description;
    gSmtpPort.value = smtpServer.port;
    gSmtpUsername.value = server.username;
    gSmtpAuthMethod.value = server.authMethod;
    gSmtpSocketType.value = server.socketType < 4 ? server.socketType : 1;
  } else {
    // New server, load default values.
    gSmtpAuthMethod.value = Services.prefs.getIntPref(
      "mail.smtpserver.default.authMethod"
    );
    gSmtpSocketType.value = Services.prefs.getIntPref(
      "mail.smtpserver.default.try_ssl"
    );
  }

  // Although sslChanged will set a label for cleartext password,
  // we need to use the long label so that we can size the dialog.
  setLabelFromStringBundle("authMethod-no", "authNo");
  setLabelFromStringBundle(
    "authMethod-password-encrypted",
    "authPasswordEncrypted"
  );
  setLabelFromStringBundle(
    "authMethod-password-cleartext",
    "authPasswordCleartextInsecurely"
  );
  setLabelFromStringBundle("authMethod-kerberos", "authKerberos");
  setLabelFromStringBundle("authMethod-ntlm", "authNTLM");
  setLabelFromStringBundle("authMethod-oauth2", "authOAuth2");
  setLabelFromStringBundle("authMethod-anysecure", "authAnySecure");
  setLabelFromStringBundle("authMethod-any", "authAny");

  window.sizeToContent();

  sslChanged(false);
  authMethodChanged(false);

  if (MailServices.outgoingServer.defaultServer) {
    onLockPreference();
  }

  // Hide OAuth2 option if we can't use it.
  const details = server
    ? OAuth2Providers.getHostnameDetails(server.serverURI.host)
    : null;
  document.getElementById("authMethod-oauth2").hidden = !details;

  // Hide deprecated/hidden auth options, unless selected
  hideUnlessSelected(document.getElementById("authMethod-anysecure"));
  hideUnlessSelected(document.getElementById("authMethod-any"));
}

function hideUnlessSelected(element) {
  element.hidden = !element.selected;
}

function setLabelFromStringBundle(elementID, stringName) {
  document.getElementById(elementID).label = document
    .getElementById("bundle_messenger")
    .getString(stringName);
}

function onAuthMethodPopupShowing() {
  // Hide/unhide OAuth2 option depending on if it's usable or not.
  const details = OAuth2Providers.getHostnameDetails(gSmtpHostname.value);
  document.getElementById("authMethod-oauth2").hidden = !details;
}

// Disables xul elements that have associated preferences locked.
function onLockPreference() {
  try {
    const allPrefElements = {
      hostname: gSmtpHostname,
      description: gSmtpDescription,
      port: gSmtpPort,
      authMethod: gSmtpAuthMethod,
      try_ssl: gSmtpSocketType,
    };
    disableIfLocked(allPrefElements);
  } catch (e) {
    // non-fatal
    console.error("Error while getting locked prefs: " + e);
  }
}

/**
 * Does the work of disabling an element given the array which contains
 * id/prefstring pairs.
 *
 * @param {Element[]} prefstrArray - Elements to check.
 *
 * TODO: try to merge this with disableIfLocked function in am-offline.js (bug 755885)
 */
function disableIfLocked(prefstrArray) {
  const smtpPrefBranch = Services.prefs.getBranch(
    "mail.smtpserver." + MailServices.outgoingServer.defaultServer.key + "."
  );

  for (const prefstring in prefstrArray) {
    if (smtpPrefBranch.prefIsLocked(prefstring)) {
      prefstrArray[prefstring].disabled = true;
    }
  }
}

function saveSmtpSettings(server) {
  if (server) {
    server.description = gSmtpDescription.value;
    server.authMethod = gSmtpAuthMethod.value;
    server.username = gSmtpUsername.value;
    server.socketType = gSmtpSocketType.value;

    const smtpServer = server.QueryInterface(Ci.nsISmtpServer);
    smtpServer.hostname = cleanUpHostName(gSmtpHostname.value);
    smtpServer.port = gSmtpPort.value;
  }
}

function authMethodChanged() {
  var noUsername = gSmtpAuthMethod.value == Ci.nsMsgAuthMethod.none;
  gSmtpUsername.disabled = noUsername;
  gSmtpUsernameLabel.disabled = noUsername;
}

/**
 * Resets the default port to SMTP or SMTPS, dependending on
 * the |gSmtpSocketType| value, and sets the port to use to this default,
 * if that's appropriate.
 *
 * @param {boolean} userAction - false for dialog initialization,
 *   true for user action.
 */
function sslChanged(userAction) {
  const DEFAULT_SMTP_PORT = "587";
  const DEFAULT_SMTPS_PORT = "465";
  var socketType = gSmtpSocketType.value;
  var otherDefaultPort;
  var prevDefaultPort = gDefaultPort.value;

  if (socketType == Ci.nsMsgSocketType.SSL) {
    gDefaultPort.value = DEFAULT_SMTPS_PORT;
    otherDefaultPort = DEFAULT_SMTP_PORT;
  } else {
    gDefaultPort.value = DEFAULT_SMTP_PORT;
    otherDefaultPort = DEFAULT_SMTPS_PORT;
  }

  // If the port is not set,
  // or the user is causing the default port to change,
  //   and the port is set to the default for the other protocol,
  // then set the port to the default for the new protocol.
  if (
    gPort.value == 0 ||
    (userAction &&
      gDefaultPort.value != prevDefaultPort &&
      gPort.value == otherDefaultPort)
  ) {
    gPort.value = gDefaultPort.value;
  }

  // switch "insecure password" label
  setLabelFromStringBundle(
    "authMethod-password-cleartext",
    socketType == Ci.nsMsgSocketType.SSL ||
      socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
      ? "authPasswordCleartextViaSSL"
      : "authPasswordCleartextInsecurely"
  );
}

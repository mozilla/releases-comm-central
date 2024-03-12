/* -*- Mode: JavaScript; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { isLegalHostNameOrIP, cleanUpHostName } = ChromeUtils.importESModule(
  "resource:///modules/hostnameUtils.sys.mjs"
);

var gCurrentDirectory = null;
var gReplicationBundle = null;
var gReplicationService = Cc[
  "@mozilla.org/addressbook/ldap-replication-service;1"
].getService(Ci.nsIAbLDAPReplicationService);
var gReplicationCancelled = false;
var gProgressText;
var gProgressMeter;
var gDownloadInProgress = false;

var kDefaultLDAPPort = 389;
var kDefaultSecureLDAPPort = 636;

window.addEventListener("DOMContentLoaded", Startup);
window.addEventListener("unload", onUnload);
document.addEventListener("dialogaccept", onAccept);
document.addEventListener("dialogcancel", onCancel);

var ldapOfflineObserver = {
  observe(subject, topic, state) {
    // sanity checks
    if (topic != "network:offline-status-changed") {
      return;
    }
    setDownloadOfflineOnlineState(state == "offline");
  },
};

function Startup() {
  gReplicationBundle = document.getElementById("bundle_replication");

  document.getElementById("download").label =
    gReplicationBundle.getString("downloadButton");
  document.getElementById("download").accessKey = gReplicationBundle.getString(
    "downloadButton.accesskey"
  );

  if (
    "arguments" in window &&
    window.arguments[0] &&
    window.arguments[0].selectedDirectory
  ) {
    gCurrentDirectory = window.arguments[0].selectedDirectory;
    try {
      fillSettings();
    } catch (ex) {
      dump(
        "pref-directory-add.js:Startup(): fillSettings() exception: " +
          ex +
          "\n"
      );
    }

    const oldListName = gCurrentDirectory.dirName;
    document.title = gReplicationBundle.getFormattedString(
      "directoryTitleEdit",
      [oldListName]
    );

    // Only set up the download button for online/offline status toggling
    // if the pref isn't locked to disable the button.
    if (
      !Services.prefs.prefIsLocked(
        gCurrentDirectory.dirPrefId + ".disable_button_download"
      )
    ) {
      // Now connect to the offline/online observer
      Services.obs.addObserver(
        ldapOfflineObserver,
        "network:offline-status-changed"
      );

      // Now set the initial offline/online state and update the state
      setDownloadOfflineOnlineState(Services.io.offline);
    }
  } else {
    document.title = gReplicationBundle.getString("directoryTitleNew");
    fillDefaultSettings();
    // Don't add observer here as it doesn't make any sense.
  }
}

function onUnload() {
  if (
    "arguments" in window &&
    window.arguments[0] &&
    window.arguments[0].selectedDirectory &&
    !Services.prefs.prefIsLocked(
      gCurrentDirectory.dirPrefId + ".disable_button_download"
    )
  ) {
    // Remove the observer that we put in on dialog startup
    Services.obs.removeObserver(
      ldapOfflineObserver,
      "network:offline-status-changed"
    );
  }
}

var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      // start the spinning
      gProgressMeter.removeAttribute("value");
      gProgressText.value = gReplicationBundle.getString(
        aStatus ? "replicationStarted" : "changesStarted"
      );
      gDownloadInProgress = true;
      document.getElementById("download").label = gReplicationBundle.getString(
        "cancelDownloadButton"
      );
      document.getElementById("download").accessKey =
        gReplicationBundle.getString("cancelDownloadButton.accesskey");
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      EndDownload(aStatus);
    }
  },
  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    gProgressText.value = gReplicationBundle.getFormattedString(
      "currentCount",
      [aCurSelfProgress]
    );
  },
  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {},
  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange(aWebProgress, aRequest, state) {},
  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {},
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

function DownloadNow() {
  if (!gDownloadInProgress) {
    gProgressText = document.getElementById("replicationProgressText");
    gProgressMeter = document.getElementById("replicationProgressMeter");

    gProgressText.hidden = false;
    gProgressMeter.hidden = false;
    gReplicationCancelled = false;

    try {
      if (gCurrentDirectory instanceof Ci.nsIAbLDAPDirectory) {
        gReplicationService.startReplication(
          gCurrentDirectory,
          progressListener
        );
      } else {
        EndDownload(Cr.NS_ERROR_FAILURE);
      }
    } catch (ex) {
      EndDownload(Cr.NS_ERROR_FAILURE);
    }
  } else {
    gReplicationCancelled = true;
    try {
      gReplicationService.cancelReplication(gCurrentDirectory);
    } catch (ex) {
      // XXX todo
      // perhaps replication hasn't started yet?  This can happen if you hit cancel after attempting to replication when offline
      dump("unexpected failure while cancelling.  ex=" + ex + "\n");
    }
  }
}

function EndDownload(aStatus) {
  document.getElementById("download").label =
    gReplicationBundle.getString("downloadButton");
  document.getElementById("download").accessKey = gReplicationBundle.getString(
    "downloadButton.accesskey"
  );

  // stop the spinning
  gProgressMeter.value = 100;
  gProgressMeter.hidden = true;

  gDownloadInProgress = false;
  if (Components.isSuccessCode(aStatus)) {
    gProgressText.value = gReplicationBundle.getString("replicationSucceeded");
  } else if (gReplicationCancelled) {
    gProgressText.value = gReplicationBundle.getString("replicationCancelled");
  } else {
    gProgressText.value = gReplicationBundle.getString("replicationFailed");
  }
}

// fill the settings panel with the data from the preferences.
//
function fillSettings() {
  document.getElementById("description").value = gCurrentDirectory.dirName;

  if (gCurrentDirectory instanceof Ci.nsIAbLDAPDirectory) {
    var ldapUrl = gCurrentDirectory.lDAPURL;

    document.getElementById("results").value = gCurrentDirectory.maxHits;
    document.getElementById("login").value = gCurrentDirectory.authDn;
    document.getElementById("hostname").value = ldapUrl.host;
    document.getElementById("basedn").value = ldapUrl.dn;
    document.getElementById("search").value = ldapUrl.filter;

    var sub = document.getElementById("sub");
    switch (ldapUrl.scope) {
      case Ci.nsILDAPURL.SCOPE_ONELEVEL:
        sub.radioGroup.selectedItem = document.getElementById("one");
        break;
      default:
        sub.radioGroup.selectedItem = sub;
        break;
    }

    var sasl = document.getElementById("saslMechanism");
    switch (gCurrentDirectory.saslMechanism) {
      case "GSSAPI":
        sasl.selectedItem = document.getElementById("GSSAPI");
        break;
      default:
        sasl.selectedItem = document.getElementById("Simple");
        break;
    }

    var secure = ldapUrl.options & ldapUrl.OPT_SECURE;
    if (secure) {
      document.getElementById("secure").setAttribute("checked", "true");
    }

    if (ldapUrl.port == -1) {
      document.getElementById("port").value = secure
        ? kDefaultSecureLDAPPort
        : kDefaultLDAPPort;
    } else {
      document.getElementById("port").value = ldapUrl.port;
    }
  }

  // check if any of the preferences for this server are locked.
  // If they are locked disable them
  DisableUriFields(gCurrentDirectory.dirPrefId + ".uri");
  DisableElementIfPrefIsLocked(
    gCurrentDirectory.dirPrefId + ".description",
    "description"
  );
  DisableElementIfPrefIsLocked(
    gCurrentDirectory.dirPrefId + ".disable_button_download",
    "download"
  );
  DisableElementIfPrefIsLocked(
    gCurrentDirectory.dirPrefId + ".maxHits",
    "results"
  );
  DisableElementIfPrefIsLocked(
    gCurrentDirectory.dirPrefId + ".auth.dn",
    "login"
  );
}

function DisableElementIfPrefIsLocked(aPrefName, aElementId) {
  if (Services.prefs.prefIsLocked(aPrefName)) {
    document.getElementById(aElementId).setAttribute("disabled", true);
  }
}

// disables all the text fields corresponding to the .uri pref.
function DisableUriFields(aPrefName) {
  if (Services.prefs.prefIsLocked(aPrefName)) {
    const lockedElements = document.querySelectorAll(
      '[disableiflocked="true"]'
    );
    for (let i = 0; i < lockedElements.length; i++) {
      lockedElements[i].setAttribute("disabled", "true");
    }
  }
}

function onSecure() {
  document.getElementById("port").value = document.getElementById("secure")
    .checked
    ? kDefaultSecureLDAPPort
    : kDefaultLDAPPort;
}

function fillDefaultSettings() {
  document.getElementById("port").value = kDefaultLDAPPort;
  var sub = document.getElementById("sub");
  sub.radioGroup.selectedItem = sub;

  // Disable the download button and add some text indicating why.
  document.getElementById("download").disabled = true;
  document.getElementById("downloadWarningMsg").hidden = false;
  document.getElementById("downloadWarningMsg").textContent = document
    .getElementById("bundle_addressBook")
    .getString("abReplicationSaveSettings");
}

function hasCharacters(number) {
  var re = /[0-9]/g;
  var num = number.match(re);
  if (num && num.length == number.length) {
    return false;
  }
  return true;
}

function onAccept(event) {
  try {
    const description = document.getElementById("description").value.trim();
    let hostname = cleanUpHostName(document.getElementById("hostname").value);
    let port = document.getElementById("port").value;
    const secure = document.getElementById("secure");
    const results = document.getElementById("results").value;
    let errorValue = null;
    let errorArg = null;
    let saslMechanism = "";

    const findDupeName = function (newName) {
      // Do not allow an already existing name.
      for (const ab of MailServices.ab.directories) {
        if (
          ab.dirName.toLowerCase() == newName.toLowerCase() &&
          (!gCurrentDirectory || ab.URI != gCurrentDirectory.URI)
        ) {
          return ab.dirName;
        }
      }
      return null;
    };

    if (!description) {
      errorValue = "invalidName";
    } else if ((errorArg = findDupeName(description))) {
      errorValue = "duplicateNameText";
    } else if (!isLegalHostNameOrIP(hostname)) {
      errorValue = "invalidHostname";
    } else if (port && hasCharacters(port)) {
      // XXX write isValidDn and call it on the dn string here?
      errorValue = "invalidPortNumber";
    } else if (results && hasCharacters(results)) {
      errorValue = "invalidResults";
    }

    if (!errorValue) {
      if (!port) {
        port = secure.checked ? kDefaultSecureLDAPPort : kDefaultLDAPPort;
      }
      if (hostname.includes(":")) {
        // Wrap IPv6 address in [].
        hostname = `[${hostname}]`;
      }
      const ldapUrl = Services.io
        .newURI(`${secure.checked ? "ldaps" : "ldap"}://${hostname}:${port}`)
        .QueryInterface(Ci.nsILDAPURL);

      ldapUrl.dn = document.getElementById("basedn").value;
      ldapUrl.scope = document.getElementById("one").selected
        ? Ci.nsILDAPURL.SCOPE_ONELEVEL
        : Ci.nsILDAPURL.SCOPE_SUBTREE;

      ldapUrl.filter = document.getElementById("search").value;
      if (document.getElementById("GSSAPI").selected) {
        saslMechanism = "GSSAPI";
      }

      // check if we are modifying an existing directory or adding a new directory
      if (gCurrentDirectory) {
        gCurrentDirectory.dirName = description;
        gCurrentDirectory.lDAPURL = ldapUrl;
        window.opener.gNewServerString = gCurrentDirectory.dirPrefId;
      } else {
        // adding a new directory
        window.opener.gNewServerString = MailServices.ab.newAddressBook(
          description,
          ldapUrl.spec,
          Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
        );
      }

      // XXX This is really annoying - both new/modify Address Book don't
      // give us back the new directory we just created - so go find it from
      // rdf so we can set a few final things up on it.
      var targetURI = "moz-abldapdirectory://" + window.opener.gNewServerString;
      var theDirectory = MailServices.ab
        .getDirectory(targetURI)
        .QueryInterface(Ci.nsIAbLDAPDirectory);

      theDirectory.maxHits = results;
      theDirectory.authDn = document.getElementById("login").value;
      theDirectory.saslMechanism = saslMechanism;

      window.opener.gNewServer = description;
      // set window.opener.gUpdate to true so that LDAP Directory Servers
      // dialog gets updated
      window.opener.gUpdate = true;
      window.arguments[0].newDirectoryUID = theDirectory.UID;
      if ("onNewDirectory" in window.arguments[0]) {
        window.arguments[0].onNewDirectory(theDirectory);
      }
    } else {
      const addressBookBundle = document.getElementById("bundle_addressBook");

      let errorText;
      if (errorArg) {
        errorText = addressBookBundle.getFormattedString(errorValue, [
          errorArg,
        ]);
      } else {
        errorText = addressBookBundle.getString(errorValue);
      }

      Services.prompt.alert(window, document.title, errorText);
      event.preventDefault();
    }
  } catch (outer) {
    console.error(
      "Internal error in pref-directory-add.js:onAccept() " + outer
    );
  }
}

function onCancel() {
  window.opener.gUpdate = false;
}

// Sets the download button state for offline or online.
// This function should only be called for ldap edit dialogs.
function setDownloadOfflineOnlineState(isOffline) {
  if (isOffline) {
    // Disable the download button and add some text indicating why.
    document.getElementById("downloadWarningMsg").textContent = document
      .getElementById("bundle_addressBook")
      .getString("abReplicationOfflineWarning");
  }
  document.getElementById("downloadWarningMsg").hidden = !isOffline;
  document.getElementById("download").disabled = isOffline;
}

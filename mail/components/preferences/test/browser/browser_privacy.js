/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes(
    "panePrivacy",
    "privacyCategory",
    {
      checkboxID: "acceptRemoteContent",
      pref: "mailnews.message_display.disable_remote_image",
      prefValues: [true, false],
    },
    {
      checkboxID: "keepHistory",
      pref: "places.history.enabled",
    },
    {
      checkboxID: "acceptCookies",
      pref: "network.cookie.cookieBehavior",
      prefValues: [2, 0],
      enabledElements: ["#acceptThirdPartyMenu", "#keepCookiesUntil"],
      unaffectedElements: ["#cookieExceptions"],
    },
    {
      checkboxID: "privacyDoNotTrackCheckbox",
      pref: "privacy.donottrackheader.enabled",
    }
  );
});

add_task(async () => {
  await testCheckboxes(
    "panePrivacy",
    "privacyJunkCategory",
    {
      checkboxID: "manualMark",
      pref: "mail.spam.manualMark",
      enabledElements: ["#manualMarkMode radio"],
    },
    {
      checkboxID: "markAsReadOnSpam",
      pref: "mail.spam.markAsReadOnSpam",
    },
    {
      checkboxID: "enableJunkLogging",
      pref: "mail.spam.logging.enabled",
      enabledElements: ["#openJunkLogButton"],
    }
  );

  await testCheckboxes("panePrivacy", "privacySecurityCategory", {
    checkboxID: "enablePhishingDetector",
    pref: "mail.phishing.detection.enabled",
  });

  await testCheckboxes("panePrivacy", "enableAntiVirusQuarantine", {
    checkboxID: "enableAntiVirusQuarantine",
    pref: "mailnews.downloadToTempFile",
  });
});

add_task(async () => {
  Services.prefs.setBoolPref("mail.spam.manualMark", true);

  await testRadioButtons("panePrivacy", "privacyJunkCategory", {
    pref: "mail.spam.manualMarkMode",
    states: [
      {
        id: "manualMarkMode0",
        prefValue: 0,
      },
      {
        id: "manualMarkMode1",
        prefValue: 1,
      },
    ],
  });
});

add_task(async () => {
  // Telemetry pref is locked.
  // await testCheckboxes("paneAdvanced", undefined, {
  //   checkboxID: "submitTelemetryBox",
  //   pref: "toolkit.telemetry.enabled",
  // });

  await testCheckboxes("panePrivacy", "enableOCSP", {
    checkboxID: "enableOCSP",
    pref: "security.OCSP.enabled",
    prefValues: [0, 1],
  });
});

// Here we'd test the update choices, but I don't want to go near that.
add_task(async () => {
  await testRadioButtons("panePrivacy", "enableOCSP", {
    pref: "security.default_personal_cert",
    states: [
      {
        id: "certSelectionAuto",
        prefValue: "Select Automatically",
      },
      {
        id: "certSelectionAsk",
        prefValue: "Ask Every Time",
      },
    ],
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * Telemetry Experiment API
 *
 * Exposes whether Thunderbird telemetry is enabled to the WebExtension so the
 * add-on can gate Sentry and PostHog on it. Telemetry is considered enabled
 * only when BOTH of Thunderbird's data-reporting prefs are on:
 *   - datareporting.policy.dataSubmissionEnabled (master switch)
 *   - datareporting.healthreport.uploadEnabled   (upload opt-in)
 * Reads fail closed: if either pref cannot be read, telemetry is treated as
 * disabled (opted out).
 */

(function (exports) {
  // Both prefs must be true for telemetry to be enabled. dataSubmissionEnabled
  // is the master data-reporting switch; uploadEnabled is the user's opt-in.
  const TELEMETRY_PREFS = [
    'datareporting.policy.dataSubmissionEnabled',
    'datareporting.healthreport.uploadEnabled',
  ];

  /**
   * Returns true only when the user has telemetry enabled. Defaults to false
   * (opted out) on any error so we never send telemetry when the pref state is
   * unknown.
   */
  function readTelemetryEnabled() {
    try {
      return TELEMETRY_PREFS.every((pref) =>
        Services.prefs.getBoolPref(pref, false)
      );
    } catch (e) {
      console.error('[Telemetry] Failed to read telemetry preferences:', e);
      return false;
    }
  }

  class Telemetry extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        thundermailTelemetry: {
          async isTelemetryEnabled() {
            return readTelemetryEnabled();
          },

          // NOTE: Under MV2 (this add-on's manifest) the background is
          // persistent, so ExtensionCommon.EventManager is sufficient here. An
          // eventual MV3 / event-page migration would instead need the
          // primed/persistent-listener pattern so pref changes can wake a
          // suspended background — revisit this then.
          onChanged: new ExtensionCommon.EventManager({
            context,
            name: 'thundermailTelemetry.onChanged',
            register(fire) {
              const observer = {
                QueryInterface: ChromeUtils.generateQI(['nsIObserver']),
                observe(_subject, _topic, data) {
                  // When observing these branches, `data` is the full name of
                  // the pref that changed. Either pref flipping can change the
                  // effective telemetry state.
                  if (TELEMETRY_PREFS.includes(data)) {
                    fire.async(readTelemetryEnabled());
                  }
                },
              };

              for (const pref of TELEMETRY_PREFS) {
                Services.prefs.addObserver(pref, observer);
              }

              // Return cleanup function — called when the listener is removed.
              return () => {
                for (const pref of TELEMETRY_PREFS) {
                  Services.prefs.removeObserver(pref, observer);
                }
              };
            },
          }).api(),
        },
      };
    }
  }

  exports.Telemetry = Telemetry;
})(this);

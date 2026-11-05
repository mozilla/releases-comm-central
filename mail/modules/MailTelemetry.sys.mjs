/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for recording mail-operation telemetry.
 *
 * Callers supply event details at the operation's recording point. These
 * helpers record the corresponding Glean events and, where supported,
 * submit enterprise events when enabled by administrator preferences.
 *
 * UI interaction tracking lives in MailUsageTelemetry.sys.mjs.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

export const MailTelemetry = {
  /**
   * Records a profile export stage when enterprise logging is enabled.
   *
   * @param {"started"|"completed"} stage
   * @param {"complete"|"partial"} [result]
   */
  recordProfileExport(stage, result) {
    if (
      !AppConstants.MOZ_ENTERPRISE ||
      !Services.prefs.getBoolPref(
        "mail.enterprise.telemetry.profileExport.enabled",
        false
      )
    ) {
      return;
    }

    try {
      const extra = { stage };
      if (result !== undefined) {
        extra.result = result;
      }
      Glean.mailEnterprise.profileExport.record(extra);
      if (
        !Services.prefs.getBoolPref(
          "mail.enterprise.telemetry.testing.disableSubmit",
          false
        )
      ) {
        GleanPings.enterprise.submit();
      }
    } catch (e) {
      console.error("Failed to report profile export", e);
    }
  },

  /**
   * Records a newly accepted TLS certificate exception.
   *
   * @param {object} extra
   * @param {string} extra.error_category
   * @param {string} extra.protocol
   * @param {string|number} extra.port
   * @param {string} extra.ui
   */
  recordCertificateExceptionAdded(extra) {
    Glean.mail.certificateExceptionAdded.record(extra);

    if (
      !AppConstants.MOZ_ENTERPRISE ||
      !Services.prefs.getBoolPref(
        "mail.enterprise.telemetry.certificateExceptionAdded.enabled",
        false
      )
    ) {
      return;
    }

    try {
      Glean.mailEnterprise.certificateExceptionAdded.record(extra);
      if (
        !Services.prefs.getBoolPref(
          "mail.enterprise.telemetry.testing.disableSubmit",
          false
        )
      ) {
        GleanPings.enterprise.submit();
      }
    } catch (e) {
      console.error("Failed to report enterprise certificate exception", e);
    }
  },
};

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailVersioning"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function greaterThanOrEqual(versionWeHave, versionWeAreComparingWith) {
  return Services.vc.compare(versionWeHave, versionWeAreComparingWith) >= 0;
}

function greaterThan(versionWeHave, versionWeAreComparingWith) {
  return Services.vc.compare(versionWeHave, versionWeAreComparingWith) > 0;
}

function lessThan(versionWeHave, versionWeAreComparingWith) {
  return Services.vc.compare(versionWeHave, versionWeAreComparingWith) < 0;
}

var EnigmailVersioning = {
  /**
   * Uses Mozilla's Version Comparator Component to identify whether the version
   * we have is greater than or equal to the version we are comparing with
   *
   * @param     String  versionWeHave               - version we have
   * @param     String  versionWeAreComparingWith   - version we want to compare with
   *
   * @return    Boolean     - The result of versionWeHave >= versionWeAreComparingWith
   */
  greaterThanOrEqual,
  /**
   * Uses Mozilla's Version Comparator Component to identify whether the version
   * we have is greater than the version we are comparing with
   *
   * @param     String  versionWeHave               - version we have
   * @param     String  versionWeAreComparingWith   - version we want to compare with
   *
   * @return    Boolean     - The result of versionWeHave > versionWeAreComparingWith
   */
  greaterThan,
  /**
   * Uses Mozilla's Version Comparator Component to identify whether the version
   * we have is less than the version we are comparing with
   *
   * @param     String  versionWeHave               - version we have
   * @param     String  versionWeAreComparingWith   - version we want to compare with
   *
   * @return    Boolean     - The result of versionWeHave < versionWeAreComparingWith
   */
  lessThan,
};

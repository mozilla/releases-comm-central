/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

const EXPORTED_SYMBOLS = ["EnigmailVersioning"];





const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;

let vc = null;

function getVersionComparator() {
  if (vc === null) {
    vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
  }
  return vc;
}

/*
 * getVersion retrieves a version from a string
 *
 * @param   String  output           - string to retrieve the version from
 * @param   String  executable       - string to print when a version is not parseable
 *
 * @return  String  versionResponse  - The first value that matches a version format
 */
function getVersion(output, executable) {
  const m = output.match(/\b(\d+\.\d+\.\d+)\b/);
  if (m) {
    const versionResponse = m[1];

    EnigmailLog.DEBUG(executable + " version found: " + versionResponse + "\n");

    return versionResponse;
  }
  else {
    return null;
  }
}

/**
 * Test the version number of any application (not gpg)
 */
function versionFoundMeetsMinimumVersionRequired(executable, minimumVersion) {
  const args = ["--version"];
  const exitCodeObj = {
    value: null
  };
  const output = EnigmailExecution.resolveAndSimpleExec(executable, args, exitCodeObj, {});
  if (!output || exitCodeObj.value < 0) {
    EnigmailLog.DEBUG("executable not found: " + executable + "\n");
    return false;
  }

  const version = getVersion(output, executable);
  if (!version) {
    EnigmailLog.DEBUG("couldn't find a version in the output from " + executable + " - total output: " + output + "\n");
    return false;
  }

  return greaterThanOrEqual(version, minimumVersion);
}

function greaterThanOrEqual(versionWeHave, versionWeAreComparingWith) {
  return getVersionComparator().compare(versionWeHave, versionWeAreComparingWith) >= 0;
}

function greaterThan(versionWeHave, versionWeAreComparingWith) {
  return getVersionComparator().compare(versionWeHave, versionWeAreComparingWith) > 0;
}

function lessThan(versionWeHave, versionWeAreComparingWith) {
  return getVersionComparator().compare(versionWeHave, versionWeAreComparingWith) < 0;
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
  greaterThanOrEqual: greaterThanOrEqual,
  /**
   * Uses Mozilla's Version Comparator Component to identify whether the version
   * we have is greater than the version we are comparing with
   *
   * @param     String  versionWeHave               - version we have
   * @param     String  versionWeAreComparingWith   - version we want to compare with
   *
   * @return    Boolean     - The result of versionWeHave > versionWeAreComparingWith
   */
  greaterThan: greaterThan,
  /**
   * Uses Mozilla's Version Comparator Component to identify whether the version
   * we have is less than the version we are comparing with
   *
   * @param     String  versionWeHave               - version we have
   * @param     String  versionWeAreComparingWith   - version we want to compare with
   *
   * @return    Boolean     - The result of versionWeHave < versionWeAreComparingWith
   */
  lessThan: lessThan,
  /**
   * Uses Mozilla's Version Comparator Component to identify whether an executable version
   * meets the required version specified
   *
   * @param     String  executable               - version of the executable
   * @param     String  minimumVersion           - version we want to compare with
   *
   * @return    Boolean     - True if the executable version meets the minimum version required,
   *                          false if it does not or it does not exist, or if a version was not
   *                          parseable from its output
   */
  versionFoundMeetsMinimumVersionRequired: versionFoundMeetsMinimumVersionRequired
};

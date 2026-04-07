/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

/**
 * Stop anything active in the status bar and clear the status text.
 */
export async function clearStatusBar(window) {
  const status = window.MsgStatusFeedback;
  try {
    await TestUtils.waitForCondition(
      () =>
        !status._startTimeoutID &&
        !status._meteorsSpinning &&
        !status._stopTimeoutID,
      "waiting for meteors to stop spinning"
    );
  } catch (ex) {
    // If the meteors don't stop spinning within 5 seconds, something has got
    // confused somewhere and they'll probably keep spinning forever.
    // Reset and hope we can continue without more problems.
    Assert.ok(!status._startTimeoutID, "meteors should not have a start timer");
    Assert.ok(!status._meteorsSpinning, "meteors should not be spinning");
    Assert.ok(!status._stopTimeoutID, "meteors should not have a stop timer");
    if (status._startTimeoutID) {
      window.clearTimeout(status._startTimeoutID);
      status._startTimeoutID = null;
    }
    if (status._stopTimeoutID) {
      window.clearTimeout(status._stopTimeoutID);
      status._stopTimeoutID = null;
    }
    MailServices.feedback.reportStatus("", "stop-meteors");
  }

  Assert.ok(
    BrowserTestUtils.isHidden(status._progressBar),
    "progress bar should not be visible"
  );
  Assert.ok(
    status._progressBar.hasAttribute("value"),
    "progress bar should not be in the indeterminate state"
  );
  if (BrowserTestUtils.isVisible(status._progressBar)) {
    // Somehow the progress bar is still visible and probably in the
    // indeterminate state, meaning vsync timers are still active. Reset it.
    MailServices.feedback.reportStatus("", "stop-meteors");
    await new Promise(resolve => setTimeout(resolve));
  }

  Assert.equal(
    status._startRequests,
    0,
    "status bar should not have any start requests"
  );
  Assert.equal(
    status._activeProcesses.length,
    0,
    "status bar should not have any active processes"
  );
  status._startRequests = 0;
  status._activeProcesses.length = 0;

  if (status._statusIntervalId) {
    window.clearInterval(status._statusIntervalId);
    delete status._statusIntervalId;
  }
  status._statusText.value = "";
  status._statusLastShown = 0;
  status._statusQueue.length = 0;
}

// Record the servers and accounts that existed before the test ran, if any.
// These will have been defined in the test manifest.
const serversAtStart = MailServices.accounts.allServers.map(s => s.key);
const accountsAtStart = MailServices.accounts.accounts.map(a => a.key);
const outgoingAtStart = MailServices.outgoingServer.servers.map(s => s.key);

export function removeServersAndAccounts() {
  for (const server of MailServices.accounts.allServers) {
    if (!serversAtStart.includes(server.key)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found server ${server.key} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
  }
  for (const account of MailServices.accounts.accounts) {
    if (!accountsAtStart.includes(account.key)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found account ${account.key} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }
  }
  for (const server of MailServices.outgoingServer.servers) {
    if (!outgoingAtStart.includes(server.key)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found server ${server.key} at the end of the test run`
      );
      MailServices.outgoingServer.deleteServer(server);
    }
  }
}

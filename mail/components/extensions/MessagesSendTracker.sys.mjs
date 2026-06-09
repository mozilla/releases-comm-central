/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Per-extension audit log and rate throttle for messages.sendMessage() and
 * messages.saveMessage().
 *
 * - The audit log covers send operations only. It posts a live Activity Manager
 *   process the first time an extension sends, and updates it after each
 *   completed send operation to report the running  count.
 *   Once ACTIVITY_FLUSH_MS have passed with no further send activity, the live
 *   process is replaced by a permanent Activity Manager event.
 * - The throttle enforces a fixed minimum gap (SEND_SAVE_GAP_MS) between the
 *   starts of two consecutive operations (send or save) from the same extension.
 */

import { DeferredTask } from "resource://gre/modules/DeferredTask.sys.mjs";

const ActivityProcess = Components.Constructor(
  "@mozilla.org/activity-process;1",
  "nsIActivityProcess",
  "init"
);
const ActivityEvent = Components.Constructor(
  "@mozilla.org/activity-event;1",
  "nsIActivityEvent",
  "init"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/activity.ftl"], true)
);
ChromeUtils.defineLazyGetter(lazy, "activityManager", () =>
  Cc["@mozilla.org/activity-manager;1"].getService(Ci.nsIActivityManager)
);

// Minimum interval between the starts of two operations (send or save) from one
// extension. A value of 125 ms equals a steady-state rate of 8 operations/s.
export const SEND_SAVE_GAP_MS = 125;

// Start-to-start rate limiter. Async generators serialize .next() calls, so
// concurrent operations from one extension queue here instead of all firing at
// once. The value of lastStartMs is updated before the next caller's iteration
// runs.
async function* sendSaveGapGenerator() {
  let lastStartMs = 0;
  while (true) {
    const waitMs = lastStartMs + SEND_SAVE_GAP_MS - Date.now();
    if (waitMs > 0) {
      await new Promise(resolve => lazy.setTimeout(resolve, waitMs));
    }
    lastStartMs = Date.now();
    yield;
  }
}

// Idle window after the last send before the live process is finalized into a
// permanent Activity Manager event.
export const ACTIVITY_FLUSH_MS = 10 * 1000; // 10 seconds

// Map for SendTracker per extension.
const trackers = new Map();

/**
 * Tracks activity for a single extension: throttles the send/save rate and
 * maintains the Activity Manager audit log (a live process while sending, a
 * permanent event once idle).
 */
class SendTracker {
  /**
   * @param {Extension} extension - The extension this tracker belongs to.
   */
  constructor(extension) {
    // The tracker can outlive the extension, and the DeferredTask (armed for
    // ACTIVITY_FLUSH_MS) must still be able to identify the extension at flush
    // time, so capture its name up-front.
    this.extensionName = extension.name;
    this.count = 0;
    this.batchStartMs = 0;
    this.batchEndMs = 0;
    // The live Activity Manager process for the current batch, or null while
    // idle. The setProgress() method is called on it after every send, flush()
    // finalizes it into a permanent event.
    this.process = null;
    this.gapLimiter = sendSaveGapGenerator();
    this.flushTask = new DeferredTask(() => {
      try {
        this.flush();
      } catch (e) {
        console.error(e);
      }
    }, ACTIVITY_FLUSH_MS);
  }

  /**
   * Record a single send. On the first send of a batch this posts a live
   * Activity Manager process. Every send updates it with the running count and
   * (re)arms the idle timer that finalizes the process into a permanent event.
   *
   * Note: Keep this method synchronous, so two concurrent sends from a single
   * extension cannot both create a process.
   */
  recordSend() {
    const now = Date.now();
    if (!this.process) {
      // First send of a new batch: post a live process to the Activity Manager.
      this.batchStartMs = now;
      this.count = 0;
      const displayText = lazy.l10n.formatValueSync(
        "extension-send-activity-live",
        { extensionName: this.extensionName }
      );
      this.process = new ActivityProcess(displayText, null);
      this.process.iconClass = "sendMail";
      this.process.groupingStyle = Ci.nsIActivity.GROUPING_STYLE_STANDALONE;
      lazy.activityManager.addActivity(this.process);
    }
    this.batchEndMs = now;
    this.count++;
    const statusText = lazy.l10n.formatValueSync(
      "extension-send-activity-progress",
      { count: this.count }
    );
    this.process.setProgress(statusText, this.count, 0);
    // Reset the idle window. The live process is finalized into a permanent
    // event if no further message is sent before ACTIVITY_FLUSH_MS has elapsed.
    this.flushTask.disarm();
    this.flushTask.arm();
  }

  /**
   * Finalize the current batch: replace the live Activity Manager process with
   * a permanent event summarizing how many messages were sent and over what
   * time span.
   */
  flush() {
    if (!this.process) {
      return;
    }
    const { count, batchStartMs, batchEndMs, process } = this;
    this.count = 0;
    this.batchStartMs = 0;
    this.batchEndMs = 0;
    this.process = null;
    this.flushTask.disarm();

    // Replace the live process with a permanent event. removeActivity() throws
    // for an in-progress process, so mark it completed first.
    process.state = Ci.nsIActivityProcess.STATE_COMPLETED;
    lazy.activityManager.removeActivity(process.id);

    const displayText = lazy.l10n.formatValueSync(
      "extension-send-activity-event",
      { extensionName: this.extensionName, count }
    );
    const seconds = Math.max(1, Math.round((batchEndMs - batchStartMs) / 1000));
    const statusText = lazy.l10n.formatValueSync(
      "extension-send-activity-event-status",
      { count, seconds }
    );
    const event = new ActivityEvent(
      displayText,
      null,
      statusText,
      batchStartMs,
      batchEndMs
    );
    event.iconClass = "sendMail";
    lazy.activityManager.addActivity(event);
  }
}

/**
 * Return the SendTracker for the given extension, creating it on first use.
 *
 * @param {Extension} extension
 * @returns {SendTracker}
 */
function getTracker(extension) {
  let tracker = trackers.get(extension);
  if (!tracker) {
    tracker = new SendTracker(extension);
    trackers.set(extension, tracker);
  }
  return tracker;
}

/**
 * Wait until at least SEND_SAVE_GAP_MS has elapsed since this extension's
 * previous operation started, then return. Enforces a minimum start-to-start
 * gap between operations (send or save) from the same extension.
 *
 * @param {Extension} extension
 * @returns {Promise<void>}
 */
export function enforceSendSaveGap(extension) {
  return getTracker(extension).gapLimiter.next();
}

/**
 * Record a successful send. Posts a live Activity Manager process on the first
 * send of a batch, updates it with the running count, and (re)arms the idle
 * timer that finalizes the process into a permanent event.
 *
 * @param {Extension} extension
 */
export function recordSend(extension) {
  getTracker(extension).recordSend();
}

// Force a flush of all pending trackers. For tests only.
Services.obs.addObserver(() => {
  for (const tracker of trackers.values()) {
    tracker.flush();
  }
  trackers.clear();
}, "messages-send-tracker-flush-for-tests");

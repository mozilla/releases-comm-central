/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "mail.feedback",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.feedback.loglevel",
  });
});

/**
 * The FeedbackService takes care of conveying status information from back-end
 * components to interested parties in the front-end. Loosely coupled.
 *
 * @implements {nsIFeedbackService}
 */
export class FeedbackService {
  QueryInterface = ChromeUtils.generateQI(["nsIFeedbackService"]);

  #lastProgress;

  /**
   * @param {string} statusMessage - Status message to pass on.
   * @param {"start-meteors"|"stop-meteors"} [meteors] - Meteors status, if any.
   */
  reportStatus(statusMessage, meteors = null) {
    lazy.log.debug(`Status: ${statusMessage}`);
    for (const win of Services.wm.getEnumerator("")) {
      win.postMessage({ statusMessage, meteors }, "*");
    }
    // TODO: we should be able to just use Services.wm.getMostRecentWindow("")
    //   but at least for some tests the right windows do not always
    //   get notified (in time?). Curently we need to notify all at least for
    //  - comm/mail/base/test/browser/browser_interactionTelemetry.js
    //  - comm/mail/components/extensions/test/browser/browser_ext_compose_begin_body.js
    //  - comm/mail/components/extensions/test/browser/browser_ext_compose_details.js
    //  - comm/mail/components/extensions/test/browser/browser_ext_compose_details_mv3.js
    //  - comm/mail/base/test/browser/menus/browser_mailContext_compose.js
  }

  /**
   * @param {integer} progress - Percent completed.
   */
  reportProgress(progress) {
    lazy.log.debug(`Progress: ${progress}`);
    // If the percentage hasn't changed...OR if we are going from 0 to 100% in one
    // step then don't bother....just fall out....
    if (
      progress === this.#lastProgress ||
      (this.#lastProgress === 0 && progress === 100)
    ) {
      return;
    }
    this.#lastProgress = progress;
    Services.wm.getMostRecentWindow("")?.postMessage({ progress }, "*");
  }
}

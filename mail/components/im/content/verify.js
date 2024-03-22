/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var verifySession = {
  onload() {
    this.sessionVerification =
      window.arguments[0].wrappedJSObject || window.arguments[0];
    if (
      this.sessionVerification.challengeType !==
      Ci.imISessionVerification.CHALLENGE_TEXT
    ) {
      throw new Error("Unsupported challenge type");
    }
    document.l10n.setAttributes(
      document.querySelector("title"),
      "verify-window-subject-title",
      {
        subject: this.sessionVerification.subject,
      }
    );
    document.getElementById("challenge").textContent =
      this.sessionVerification.challenge;
    if (this.sessionVerification.challengeDescription) {
      const description = document.getElementById("challengeDescription");
      description.hidden = false;
      description.textContent = this.sessionVerification.challengeDescription;
    }
    document.addEventListener("dialogaccept", () => {
      this.sessionVerification.submitResponse(true);
    });
    document.addEventListener("dialogextra2", () => {
      this.sessionVerification.submitResponse(false);
      document
        .getElementById("verifySessionDialog")
        .querySelector("dialog")
        .acceptDialog();
    });
    document.addEventListener("dialogcancel", () => {
      this.sessionVerification.cancel();
    });
    this.sessionVerification.completePromise.catch(() => {
      document
        .getElementById("verifySessionDialog")
        .querySelector("dialog")
        .cancelDialog();
    });
  },
};

window.addEventListener("load", () => {
  verifySession.onload();
});

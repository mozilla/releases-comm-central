/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Sets the title of a standalone Account Hub step and waits for its text.
 *
 * @param {HTMLElement} step - The Account Hub step in the test.
 * @param {string} titleId - The Fluent message ID for the title.
 * @returns {Promise<void>} Resolves when Fluent translates the title.
 */
async function setAccountHubStepTitle(step, titleId) {
  step.setTitle(titleId);
  await step.l10n.translateElements([step.shadowRoot.querySelector("#title")]);
}

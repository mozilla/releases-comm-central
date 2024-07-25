/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Config Found Template
 * Template ID: #accountHubConfigFoundTemplate (from accountHubConfigFoundTemplate.inc.xhtml)
 */
class EmailConfigFound extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      super.connectedCallback();
      return;
    }

    this.hasConnected = true;
    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailConfigFoundTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
  }
}

customElements.define("email-config-found", EmailConfigFound);

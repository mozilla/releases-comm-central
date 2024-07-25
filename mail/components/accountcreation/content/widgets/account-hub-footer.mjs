/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Account Hub Footer Template
 * Template ID: #accountHubFooterTemplate (from accountHubFooterTemplate.inc.xhtml)
 */

class AccountHubFooter extends HTMLElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubFooterTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
    this.querySelector("#back").addEventListener("click", this);
    this.querySelector("#forward").addEventListener("click", this);

    const customAction = this.querySelector("#custom");
    if (customAction) {
      customAction.addEventListener("click", this);
    }
  }

  handleEvent(event) {
    this.dispatchEvent(new CustomEvent(event.target.id));
  }

  canBack(val) {
    this.querySelector("#back").hidden = !val;
  }

  canForward(val) {
    this.querySelector("#forward").hidden = !val;
  }

  canCustom(val) {
    const customAction = this.querySelector("#custom");
    customAction.hidden = !val;
    if (val) {
      customAction.addEventListener("click", this);
      document.l10n.setAttributes(customAction, val);
    }
  }
}

customElements.define("account-hub-footer", AccountHubFooter);

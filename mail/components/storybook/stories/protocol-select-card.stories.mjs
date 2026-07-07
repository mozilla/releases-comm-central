/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/variables.css";
import "mail/themes/shared/mail/accountHub.css";

export default {
  title: "Widgets/Account Hub/Protocol Select Card",
  tags: ["autodocs"],
};

const ProtocolSelectCard = ({
  body,
  checked = false,
  recommended = false,
  title,
  value,
}) => {
  const className = [
    "account-hub-protocol-select-card",
    recommended ? "recommended" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return html`
    <label class=${className}>
      <input
        type="radio"
        name="protocol-select"
        value=${value}
        ${checked ? 'checked="checked"' : ""}
      />
      <span class="account-hub-protocol-select-card-content">
        <span
          class="account-hub-protocol-select-card-badge"
          data-l10n-id="account-hub-result-recommended-label"
          >Recommended</span
        >
        <span class="account-hub-protocol-select-card-header">
          <img
            class="account-hub-protocol-select-card-icon"
            src="chrome://messenger/skin/icons/new/normal/mail.svg"
            alt=""
          />
          <span>${title}</span>
        </span>
        <span
          class="account-hub-protocol-select-card-body"
          data-l10n-id="account-hub-protocol-${value}"
          >${body}</span
        >
      </span>
    </label>
  `;
};

const ProtocolSelectCards = ({ title, body }) => html`
  <form class="account-hub-protocol-select-card-story">
    <div class="hub-body protocol-select-select-body">
      <fieldset class="account-hub-protocol-select-list">
        ${ProtocolSelectCard({
          body,
          checked: true,
          recommended: true,
          title,
          value: "imap",
        })}
        ${ProtocolSelectCard({
          body: html`Exchange<br />or<br />Microsoft 365`,
          title: "Microsoft",
          value: "microsoft",
        })}
        ${ProtocolSelectCard({
          body: "Download to device",
          title: "POP3",
          value: "pop3",
        })}
      </fieldset>
    </div>
  </form>
`;

export const Default = ProtocolSelectCards.bind({});
Default.args = {
  title: "IMAP",
  body: "Sync across devices",
};

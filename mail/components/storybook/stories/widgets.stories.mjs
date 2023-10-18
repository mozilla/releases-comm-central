/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/variables.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/widgets.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/icons.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Design System/Widgets",
};

export const Widgets = () => html`
  <h1>
    Each of these widgets shown off is based on CSS classes provided by
    <code>chrome://messenger/skin/widgets.css</code>
  </h1>
`;

export const Button = () => html`<button class="button">Button</button>`;

export const IconButton = () => html`
  <button class="button icon-button" style="background-image: var(--icon-add);">
    New
  </button>
`;

export const IconOnlyButton = () => html`
  <button
    class="button icon-button icon-only"
    style="background-image: var(--icon-add);"
  ></button>
`;

export const PrimaryButton = () => html`
  <button class="button button-primary">Primary Button</button>
  <button
    class="button button-primary icon-button"
    style="background-image: var(--icon-add);"
  >
    Primary Button
  </button>
`;

export const DestructiveButton = () => html`
  <button class="button button-destructive">Destructive</button>
  <button
    class="button button-destructive icon-button"
    style="background-image: var(--icon-trash);"
  >
    Destructive
  </button>
`;

export const FlatButton = () => html`
  <button class="button button-flat">Flat button</button>
  <button
    class="button button-flat icon-button"
    style="background-image: var(--icon-add);"
  >
    Flat button
  </button>
  <button
    class="button button-flat icon-button icon-only"
    style="background-image: var(--icon-add);"
  ></button>
`;

export const LinkButton = () => html`
  <button class="button link-button">Link</button>
`;

export const CheckButton = () => html`
  <button class="button check-button">Check button</button>
  <button class="button check-button" aria-pressed="true">Check button</button>
  <button
    class="button check-button icon-button"
    style="background-image: var(--icon-add);"
  >
    Check button
  </button>
  <button
    class="button check-button icon-button"
    aria-pressed="true"
    style="background-image: var(--icon-add);"
  >
    Check button
  </button>
  <button
    class="button check-button icon-button icon-only"
    style="background-image: var(--icon-add);"
  ></button>
  <button
    class="button check-button icon-button icon-only"
    style="background-image: var(--icon-add);"
    aria-pressed="true"
  ></button>
`;

export const ButtonGroup = () => html`
  <div class="button-group">
    <button class="button">First button</button>
    <button class="button">Second</button>
    <button class="button">One more</button>
  </div>
  <div class="button-group">
    <button
      class="button icon-button icon-only"
      style="background-image: var(--icon-add);"
    ></button>
    <button
      class="button icon-button icon-only"
      style="background-image: var(--icon-star);"
    ></button>
    <button
      class="button icon-button icon-only"
      style="background-image: var(--icon-trash);"
    ></button>
  </div>
`;

export const Select = () => html`
  <select class="select">
    <option selected disabled>Select something</option>
    <option value="1">Option</option>
    <option value="B">Another one</option>
  </select>
`;

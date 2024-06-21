/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/variables.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/icons.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/tree-listbox.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/list-container.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Design System/List Container",
  tags: ["autodocs"],
  argTypes: {
    expanded: {
      control: "boolean",
    },
  },
};

export const ListContainer = () => html`
  <h1>
    Each of these lists shown off are based on CSS classes provided by
    <code>chrome://messenger/skin/shared/list-container.css</code>. These styles
    are designed to work with the <code>tree-listbox</code> component.
  </h1>
`;

export const List = ({ expanded }) => html`
  <style>
    :root {
      --sidebar-background: var(--layout-background-2);
    }
  </style>
  <ul role="tree" style="background: var(--sidebar-background)">
    <li tabindex="0"><div class="container">List item</div></li>
    <li tabindex="0" class="selected">
      <div class="container">List item</div>
    </li>
    <li tabindex="0" class="selected current">
      <div class="container">List item</div>
    </li>
    <li tabindex="0" class="children${expanded ? "" : " collapsed"}">
      <div class="container">
        <span class="twisty"
          ><img
            class="twisty-icon"
            src="chrome://messenger/skin/icons/new/compact/nav-down.svg"
        /></span>
        List item
      </div>
    </li>
  </ul>
`;

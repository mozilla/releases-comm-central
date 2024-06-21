/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/themes/shared/mail/variables.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/tree-listbox.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/list-container.css"; //eslint-disable-line import/no-unassigned-import
import "mail/base/content/widgets/listbox/tree-listbox.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Tree/Tree Listbox with Styles",
  tags: ["autodocs"],
};

export const Tree = () => html`
  <style>
    :root {
      --sidebar-background: var(--layout-background-2);
    }
    ul {
      background: var(--sidebar-background);
      overflow: hidden;
      list-style-type: none;
      margin: 0;
      padding: 0;
    }
  </style>
  <ul is="tree-listbox" @select="${action("select")}" role="tree">
    <li
      class="children"
      @collapsed="${action("collapsed")}"
      @expanded="${action("expanded")}"
    >
      <div class="container">
        <button class="twisty">
          <img
            class="twisty-icon"
            src="chrome://messenger/skin/icons/new/compact/nav-down.svg"
          />
        </button>
        Item with children
      </div>
      <ul>
        <li><div class="container">Child</div></li>
        <li><div class="container">Another child</div></li>
      </ul>
    </li>
    <li><div class="container">Sibling</div></li>
    <li class="unselectable"><div class="container">Unselectable</div></li>
  </ul>
`;

export const TreeTable = () => html`
  <style>
    :root {
      --sidebar-background: var(--layout-background-2);
    }
    table {
      background: var(--sidebar-background);
      width: 100%;
    }
    td {
      line-height: 2;
    }
  </style>
  <table is="tree-view-table" class="multi-selected">
    <tbody is="tree-view-table-body" tabindex="0">
      <tr class="children table-layout">
        <td>
          <button class="twisty">
            <img
              class="twisty-icon"
              src="chrome://messenger/skin/icons/new/compact/nav-down.svg"
            />
          </button>
          Item with children
        </td>
      </tr>
      <tr class="table-layout selected">
        <td>Sibling</td>
      </tr>
      <tr class="table-layout current selected">
        <td>Sibling</td>
      </tr>
      <tr class="table-layout">
        <td>Sibling</td>
      </tr>
    </tbody>
  </table>
`;

export const TreeTableCard = () => html`
  <style>
    :root {
      --sidebar-background: var(--layout-background-2);
    }
    table {
      background: var(--sidebar-background);
      width: 100%;
    }
    .card-container {
      padding: 1em;
    }
  </style>
  <table is="tree-view-table">
    <tbody is="tree-view-table-body" tabindex="0">
      <tr class="children card-layout">
        <td>
          <div class="card-container">
            <button class="twisty">
              <img
                class="twisty-icon"
                src="chrome://messenger/skin/icons/new/compact/nav-down.svg"
              />
            </button>
            Item with children
          </div>
        </td>
      </tr>
      <tr class="card-layout selected">
        <td><div class="card-container">Sibling</div></td>
      </tr>
      <tr class="card-layout current selected">
        <td><div class="card-container">Sibling</div></td>
      </tr>
      <tr class="card-layout">
        <td><div class="card-container">Sibling</div></td>
      </tr>
    </tbody>
  </table>
`;

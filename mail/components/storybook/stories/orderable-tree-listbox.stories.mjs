/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/base/content/widgets/listbox/orderable-tree-listbox.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Tree/Orderable Tree Listbox",
  component: "orderable-tree-listbox",
  tags: ["autodocs"],
};

export const Tree = () => html`
  <style>
    li.collapsed > ul {
      display: none;
    }
    li {
      user-select: none;

      &.unselectable {
        cursor: not-allowed;
      }

      &:not(.unselectable) > div:hover {
        outline: 1px solid AccentColor;
      }
    }
    li.selected > div {
      background: AccentColor;
      color: AccentColorText;
    }
  </style>
  <ol
    is="orderable-tree-listbox"
    @select="${action("select")}"
    @ordered="${action("ordered")}"
    role="tree"
  >
    <li
      class="children collapsed"
      @collapsed="${action("collapsed")}"
      @expanded="${action("expanded")}"
      draggable="true"
    >
      <div>Item with children</div>
      <button class="twisty">Toggle children</button>
      <ul>
        <li><div>Child</div></li>
        <li><div>Another child</div></li>
      </ul>
    </li>
    <li draggable="true"><div>Sibling</div></li>
    <li class="unselectable"><div>Unselectable</div></li>
  </ol>
`;

export const Listbox = () => html`
  <style>
    li {
      user-select: none;

      &.unselectable {
        cursor: not-allowed;
      }

      &:not(.unselectable) > div:hover {
        outline: 1px solid AccentColor;
      }
    }
    li.selected > div {
      background: AccentColor;
      color: AccentColorText;
    }
  </style>
  <ol
    is="orderable-tree-listbox"
    @select="${action("select")}"
    @ordered="${action("ordered")}"
    role="listbox"
  >
    <li draggable="true"><div>Item</div></li>
    <li draggable="true"><div>Sibling</div></li>
    <li class="unselectable"><div>Unselectable</div></li>
  </ol>
`;

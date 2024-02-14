/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/base/content/widgets/listbox/tree-listbox.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Tree/Tree Listbox",
  component: "tree-listbox",
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
  <ul is="tree-listbox" @select="${action("select")}" role="tree">
    <li
      class="children"
      @collapsed="${action("collapsed")}"
      @expanded="${action("expanded")}"
    >
      <div>Item with children</div>
      <button class="twisty">Toggle children</button>
      <ul>
        <li><div>Child</div></li>
        <li><div>Another child</div></li>
      </ul>
    </li>
    <li><div>Sibling</div></li>
    <li class="unselectable"><div>Unselectable</div></li>
  </ul>
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
  <ul is="tree-listbox" @select="${action("select")}" role="listbox">
    <li><div>First item</div></li>
    <li><div>Second item</div></li>
    <li class="unselectable"><div>Unselectable item</div></li>
    <li><div>Third item</div></li>
  </ul>
`;

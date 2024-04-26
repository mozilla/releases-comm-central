/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/pane-splitter.js"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Pane Splitter",
  component: "pane-splitter",
  tags: ["autodocs"],
  argTypes: {
    resizeDirection: {
      options: ["", "vertical", "horizontal"],
      control: { type: "radio" },
    },
  },
};

const Template = ({ resizeDirection, collapseWidth, collapseHeight }) => html`
  <style>
    hr[is="pane-splitter"] {
      border: none;
      z-index: 1;
      margin: ${resizeDirection === "horizontal" ? "0 -3px" : "-3px 0"};
      opacity: .4;
      background-color: red;
    }

    .wrapper {
      display: inline-grid;
      grid-template-${
        resizeDirection === "horizontal" ? "columns" : "rows"
      }: minmax(auto, var(--splitter-${
  resizeDirection === "horizontal" ? "width" : "height"
})) 0 auto;
      width: 500px;
      height: 500px;
      margin: 1em;
      --splitter-width: 200px;
      --splitter-height: 200px;
    }
  </style>
  <div class="wrapper">
    <div id="resizeme" style="background: lightblue"></div>
    <hr is="pane-splitter"
      resize-direction="${resizeDirection}"
      resize-id="resizeme"
      collapse-width="${collapseWidth}"
      collapse-height="${collapseHeight}"
      id="splitter"
    ></hr>
    <div id="fill" style="background: lightslategrey"></div>
  </div>
`;

export const PaneSplitter = Template.bind({});
PaneSplitter.args = {
  resizeDirection: "",
  collapseWidth: 0,
  collapseHeight: 0,
};

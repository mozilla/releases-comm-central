/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/colors.css"; //eslint-disable-line import/no-unassigned-import

const FORMATTER = new Intl.NumberFormat("en", {
  numberingSystem: "latn",
  style: "decimal",
  minimumIntegerDigits: 2,
  maximumFractionDigits: 0,
});

const VARIANT_RANGE = {
  white: [],
  gray: [10, 90],
  red: [30, 90],
  orange: [30, 90],
  amber: [30, 90],
  yellow: [30, 90],
  green: [30, 90],
  teal: [30, 90],
  blue: [0, 90],
  purple: [0, 90],
  magenta: [30, 90],
  brown: [30, 90],
  ink: [30, 90],
};

const ALL_COLORS = Object.entries(VARIANT_RANGE).flatMap(([color, range]) => {
  if (!range.length) {
    return [color];
  }
  const colors = [];
  for (let variant = range[0]; variant <= range[1]; variant += 10) {
    colors.push(`${color}-${FORMATTER.format(variant)}`);
  }
  return colors;
});

export default {
  title: "Design System/Colors",
  argTypes: {
    color1: {
      options: ALL_COLORS,
      control: { type: "select" },
    },
    color2: {
      options: ALL_COLORS,
      control: { type: "select" },
    },
  },
};

function createColor(colorName) {
  const cssVariableName = `--color-${colorName}`;
  const color = document.createElement("div");
  color.style.padding = "0.5em";
  const preview = document.createElement("div");
  preview.style.width = "200px";
  preview.style.height = "50px";
  preview.style.background = `var(${cssVariableName})`;
  const legend = document.createElement("span");
  legend.textContent = cssVariableName;
  color.append(preview, legend);
  return color;
}

export const Colors = {
  render: () => {
    const container = document.createElement("div");
    container.append(...ALL_COLORS.map(createColor));
    return container;
  },
};

const Template = ({ color1, color2 }) => html`
  <div style="display: grid">
    <div style="height: 40vh; background: var(--color-${color1})"></div>
    <div style="height: 40vh; background: var(--color-${color2})"></div>
  </div>
`;

export const CompareColors = Template.bind({});
CompareColors.args = {
  color1: "white",
  color2: "ink-90",
};

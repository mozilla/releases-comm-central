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
  black: [],
  gray: [5, 10, 90],
  red: [10, 90],
  orange: [10, 90],
  amber: [10, 90],
  yellow: [30, 90],
  green: [10, 90],
  teal: [10, 90],
  blue: [10, 90],
  purple: [10, 90],
  magenta: [10, 90],
  brown: [10, 90],
  ink: [10, 90],
};

const ALL_COLORS = Object.entries(VARIANT_RANGE).flatMap(([color, range]) => {
  if (!range.length) {
    return [color];
  }
  const colors = [];
  let start = 0;
  while (range[start] < 10) {
    colors.push(`${color}-${FORMATTER.format(range[start])}`);
    ++start;
  }
  for (let variant = range[start]; variant <= range[start + 1]; variant += 10) {
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
  const legend = document.createElement("code");
  legend.textContent = cssVariableName;
  color.append(preview, legend);
  return color;
}

export const Colors = {
  render: () => {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "afterbegin",
      "<h1>Color variables provided by <code>chrome://messenger/skin/colors.css</code>:</h1>"
    );
    container.append(...ALL_COLORS.map(createColor));
    return container;
  },
};

const CompareTemplate = ({ color1, color2 }) => html`
  <div style="display: grid">
    <div style="height: 40vh; background: var(--color-${color1})"></div>
    <div style="height: 40vh; background: var(--color-${color2})"></div>
  </div>
`;

export const CompareColors = CompareTemplate.bind({});
CompareColors.args = {
  color1: "white",
  color2: "ink-90",
};

const TextContrastTemplate = ({ color1, color2 }) => html`
  <section
    style="background-color: var(--color-${color1}); color: var(--color-${color2});"
  >
    <p>
      Consectetur voluptatem voluptatibus nihil nobis dignissimos suscipit et
      odio. Ipsa sequi ad aperiam officia aut maxime. Voluptas qui et
      repellendus corrupti. Libero nihil in corrupti non dolorem.
    </p>
    <p>
      Eligendi eligendi deleniti necessitatibus. Tempore ipsam illum cumque.
      Excepturi ex explicabo et.
    </p>
    <p>
      Aut sequi consequuntur asperiores non. Corporis quos reprehenderit
      consequuntur sint. Ipsa numquam sint id non tempore doloremque. Nam
      quibusdam blanditiis nostrum. Ducimus autem nesciunt quam officia sunt et.
    </p>
    <p>
      Recusandae facere laudantium ad quas tenetur non vel ullam. Voluptas hic
      dicta itaque doloribus repellendus impedit laborum. Illum velit
      dignissimos voluptatem dolorem quo sit hic. Sequi occaecati exercitationem
      non veniam sed suscipit blanditiis consequatur. Facere eum eaque fugiat
      esse quisquam qui dolor et.
    </p>
    <p>
      Ut et perspiciatis recusandae recusandae. Voluptate temporibus quia
      voluptas cumque. Sint ut qui mollitia fugiat omnis qui distinctio. Numquam
      expedita amet quas velit consequatur laborum. Eius officiis modi unde
      earum voluptas est sed.
    </p>
  </section>
`;
export const TextContrast = TextContrastTemplate.bind({});
TextContrast.args = {
  color1: "white",
  color2: "ink-90",
};

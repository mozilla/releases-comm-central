# Creating a new story

## Skeleton of the story

To start off, create a new file in `mail/components/storybook/stories` with a filename following the pattern of `<custom-element-tag-name>.stories.mjs`. If you're not creating a story for a custom element, choose the main title of the story instead.

Next up, you'll want to make sure you have your MPL 2.0 header.
To make this a story, all that's missing is an object exported as default with a `title` property. The title is a string with `/` separating its path elements inside the storybook navigation. At the time of writing, we have “Design System” and “Widgets” root groups where stories are split into.

If the story is for a custom element, make sure to also import the file that declares the custom element. Storybook is set up so you can import files in `mail/` by just starting the import path with `mail/`. The default export object should have a second property `component` containing the tag name of the custom element. This is used to find the related JSDoc documentation.

So far we'd end up with this `example-widget.stories.mjs`:
```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/base/content/widgets/example-widget.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Example Widget",
  component: "example-widget",
};
```

## Adding markup to the story

All named exports of the `stories.mjs` are rendered as separate subpages in storybook. The exports' PascalCase name has spaces inserted (to turn into “Pascal Case”). The named exports are expected to be objects with a `render` function. That function simply has to return the node that should be rendered in the story.

The generated markup has to contain everything our custom element needs to work, so we might need to include a template, children, styles etc. The story currently only gets `global.css`, so any other styles that might be required need to be imported by the story. There is some support for fluent, though it is currently mostly untested for Thunderbird and lagging behind what the Firefox storybook can do.

We often opt to use [lit](https://lit.dev) so we can just use a template string to generate the render function. To use lit, you will need to import the `html` template string decorator from the `lit` module. What we then export is a template function that renders a template string with lit.

`example-widget.stories.mjs`:
```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/example-widget.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Example Widget",
  component: "example-widget",
};

const ExampleWidgetTemplate = () => html`
  <example-widget></example-widget>
`;

export const ExampleWidget = ExampleWidgetTemplate.bind({});
```

## Custom element attributes

Often the behavior of custom elements can be customized with attributes. Storybook offers the args mechanism to define inputs to the rendering of the custom element. We get the values supplied in an object of our render function, while we need to declare their default value in an args property on the named export. Generally the arg's name should match the name of the attribute it controls.

Full documentation (including restricting the available values and controlling the input): https://storybook.js.org/docs/6.5/writing-stories/args

`example-widget.stories.mjs` with an arg for the `title` attribute:
```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/example-widget.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Example Widget",
  component: "example-widget",
};

const ExampleWidgetTemplate = ({ title }) => html`
  <example-widget title="${title}"></example-widget>
`;

export const ExampleWidget = ExampleWidgetTemplate.bind({});
ExampleWidget.args = {
  title: "Hello World!",
};
```

Tip: to have lit toggle a boolean attribute, prefix the attribute name with a `?` (`?disabled=”${disabled}”`). https://lit.dev/docs/templates/expressions/#boolean-attribute-expressions

## Custom element events

Storybook actions let the story provide feedback when something occurred within the story. Usually this would be used to show events that were dispatched on a custom element. To use actions, we simply import `action` from `@storybook/addon-actions` and call it with a string naming the action to get a callback that we can pass the actual data to.

So usually we call the action function with the name of the event and then invoke the resulting callback with the actual event.

`example-widget.stories.mjs` listening to the highlight event and surfacing it as an action named highlight:
```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/base/content/widgets/example-widget.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Example Widget",
  component: "example-widget",
};

const ExampleWidgetTemplate = ({ title }) => html`
  <example-widget title="${title}" @highlight="${action("highlight")}"></example-widget>
`;

export const ExampleWidget = ExampleWidgetTemplate.bind({});
ExampleWidget.args = {
  title: "Hello World!",
};
```

## Documentation
The documentation page is generated from JSDoc comments within the custom element's implementation. Some special JSDoc tags are used to document custom element-specific features, see https://custom-elements-manifest.open-wc.org/analyzer/getting-started/#supported-jsdoc. Note that an attribute is in HTML and a property is in the JS API of the custom element.

## Further reading
The official storybook documentation explains some more tricks you have available: https://storybook.js.org/docs/6.5/writing-stories/introduction

Lit can do much more with templates than just setting attributes and adding event listeners, though usually that is enough for stories. https://lit.dev/docs/templates/overview/

You might also consider the Firefox storybook, though our setup is not exactly the same. https://firefoxux.github.io/firefox-desktop-components/?path=/docs/docs-storybook--page

# Running Storybook

Storybook requires Node.js 20.19 or later in the Node.js 20 release line, or
Node.js 22.12 or later. It uses the Vite builder for Web Components.

You can run Storybook by executing

```
# Working directory is your comm-central checkout root directory.
../mach tb-storybook
```

Now Storybook should be running at `http://localhost:5703` and Thunderbird will
open with a temporary profile, loading a tab with Storybook.

You can disable Thunderbird opening with the command using the `--no-open`
option.

Storybook resolves native stylesheet URLs with the generated chrome map. Vite
serves these stylesheets and their images over HTTP, including stylesheets
linked by custom elements. Nested CSS imports use the same source mapping.
Stylesheets that need Mozilla preprocessing are not supported.

Changes to imported source files should appear in the opened tab. Reload the
page after changing a stylesheet linked inside a shadow root.

## Manually opening Storybook in Thunderbird

Run the following command in your Thunderbird developer console:

```js
tabmail.openTab("contentTab", { url: "http://localhost:5703" })
```

You can also launch Thunderbird with Storybook getting loaded in a new tab in a
temporary profile using `../mach tb-storybook launch`. If the
`--no-temp-profile` flag is specified, your normal development profile is opened
and no preferences are modified except to open Storybook in the first place.
Consider the next section on preferences you might want to flip while using
Storybook like this.

## Ensuring all style features work

Our stylesheets use some features that are not available to web content. To fix
this a couple preferences have to be set to true:

```
svg.context-properties.content.enabled = true
layout.css.light-dark.enabled = true
```

To change those preferences in your Thunderbird profile, go to the Settings and
scroll to the bottom in the General pane. Click to open the Config Editor and
enter the preference names in the search bar.

You might not want to keep these preferences enabled on a long-lived profile.

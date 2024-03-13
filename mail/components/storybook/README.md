# Running Storybook

You can run Storybook by executing

```
# Working directory is your comm-central checkout root directory.
../mach tb-storybook
```

Now Storybook should be running at `http://localhost:5703` and Thunderbird will
open with a temporary profile, loading a tab with Storybook.

You can disable Thunderbird opening with the command using the `--no-open`
option.

Changes to files directly referenced from the Storybook (so basically
non-chrome:// paths) should automatically reflect changes in the opened tab.
If you make a change to a chrome:// referenced file then you'll need to do a
hard refresh (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>) to notice the changes.

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

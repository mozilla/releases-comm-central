= Storybook for Thunderbird

Storybook is a component library to document our design system, reusable
components and any specific components you might want to test with dummy data.

== Background

The storybook will list components that can be reused, and will help document
what common elements we have. It can also list implementation specific
components, but they should not be added to the "Design System" section.

Changes to files directly referenced from the storybook (so basically
non-chrome:// paths) should automatically reflect changes in the opened tab.
If you make a change to a chrome:// referenced file then you'll need to do a
hard refresh (Cmd+Shift+R/Ctrl+Shift+R) to notice the changes.

=== Running storybook

You can run storybook by executing

```
# Working directory is your comm-central checkout root directory.
../mach tb-storybook
```

Now storybook should be running at `http://localhost:5703` and Thunderbird will
open with a temporary profile, loading a tab with storybook.

You can disable Thunderbird opening with the command using the `--no-open`
option.

==== Manually opening Storybook in Thunderbird

Run the following command in your Thunderbird developer console:

```js
tabmail.openTab("contentTab", { url: "http://localhost:5703" })
```

You can also launch Thunderbird with storybook getting loaded in a new tab in a
temporary profile using `../mach tb-storybook launch`. If the
`--no-temp-profile` flag is specified, your normal development profile is opened
and no preferences are modified except to open storybook in the first place.
Consider the next section on preferences you might want to flip while using
storybook like this.

==== Ensuring all style features work

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

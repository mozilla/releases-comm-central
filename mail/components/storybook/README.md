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

First time around, you will have to install the npm dependencies for storybook.
There is a mach command to do so using the mach-provided `npm`:

```
# Working directory is your comm-central checkout root directory.
../mach tb-storybook install
```

Once the npm dependencies are installed, you can run storybook by executing

```
# Working directory is your comm-central checkout root directory.
../mach tb-storybook
```

Now storybook should be running at `http://localhost:5703`. To use storybook, run
the following command in your Thunderbird developer console:

```js
tabmail.openTab("contentTab", { url: "http://localhost:5703" })
```

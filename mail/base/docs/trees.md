# Tree Views and Data Adapters

This document describes how Thunderbird displays large amounts of data in a tree or list structure.

Thunderbird is transitioning away from using the XUL `<tree>` element and the associated
`nsITreeView` interface for providing data to it. This is tracked on Bugzilla in the
[tb-deforestation bug](https://bugzilla.mozilla.org/show_bug.cgi?id=tb-deforestation).

```{note}
Confusingly, both the UI element displaying data and the classes providing the data are called
"view". Naming is hard. We are moving towards calling the latter a "data adapter" instead.

And there may or may not be any tree (hierarchy) involved, the data could be a flat list.
```

## TreeView

`TreeView` is an HTML custom element (`<tree-view>`) replacement for `<tree>`. It is currently used
as the message list in the mail tab and the contacts list in the address book tab. For the mail tab
it supports `nsITreeView` as the mail views are currently implemented in the C++ back end (see
`nsMsgDBView` and friends). There are also a few extra pieces of code which really should be in
`about3Pane.js` but … aren't.

The custom element contains a table for displaying the data in rows and columns ("table layout"),
although that's not strictly necessary. Both the mail tab and address book tab default to a
single-column "cards layout" where each item's data is displayed in a multi-line card.

Only the rows in view, and some rows just off-screen, actually exist as rows in the table. To set
the table's height for scrolling, and to preserve the scroll position, spacer rows are positioned
above and below the visible rows. The height of the spacer rows changes as the table is scrolled,
or if the total number of rows changes. Initially the visible rows are rendered, then a buffer of
off-screen rows is added above and below the visible rows for display while scrolling. The number
of buffer rows depends on the number of visible rows.

### TreeViewTableRow

`TreeViewTableRow` is another custom element which is the rows in the table. It is a base class
providing various selection and utility functions which are the same for every tree view. In all
uses a subclass should extend it, with the relevant code for display.

To tell a `TreeView` which row element to use, set the `rows` attribute to the name of the element.

The `ROW_HEIGHT` property sets the height of table rows. Do not allow rows to be taller than this
height, or you're going to have a bad time.

The `index` property is the index of the row within the tree.

The `fillRow` method is used to create the display for a row. Subclasses should override this and
call back to it. `fillRow` is _usually_ called one frame after `index` is set, and `index` can be
set many times before `fillRow` is called – for example if the view is being filled very fast.

## AutoTreeView

`AutoTreeView` is a subclass of `TreeView` designed to be a better drop-in replacement for XUL
trees and such it does several things automatically (hence the name). Most importantly a row class
does not need to be provided for each use, it has its own. Set the `defaultColumns` and `view`
properties and `AutoTreeView` will do everything for you.

Column visibility, width, order, and sorting are handled and these are persisted in the profile for
the next time the page appears.

Hierarchical data structures can be displayed, with automatic indentation and twisty buttons.

Cells can contain icons (styled by CSS based on row properties) and check boxes.

`AutoTreeView` does _not_ support `nsITreeView` views.

### AutoTreeViewTableRow

`AutoTreeViewTableRow` is a row class for table layout which handles rows and cells as configured
by `AutoTreeView`.

## TreeDataAdapter

To get data from where it is to the UI, use a `TreeDataAdapter` or, more likely, a subclass for
tidiness. This class is based heavily on the `nsITreeView` interface it replaces, and until we
remove the need for `TreeView` to support `nsITreeView` (hopefully with [Panorama](/panorama/index)),
it needs to support some old ways of doing things.

In a simple example, fill the `_rowMap` property with any number of `TreeDataRow` objects, and tell
the tree view about them with the `invalidate` and `rowCountChanged` methods.

### TreeDataRow

This class contains just the data to be displayed, and the meta-data to do so. Each row object has
the following properties:

- `texts` – The text to be displayed for this row. This is a JS object, where the keys are column
  IDs, and values are the text to display.
- `values` – Same as `texts`, but instead the values are string or numeric values for sorting rows.
- `properties` – A collection of properties (strings) for this row.
- `level` – How deep in the tree this row is. Top-level rows are at level 0.
- `open`  – Whether or not this row is open (i.e. its children are visible).
- `parent`  – The parent of this row, or null if this is a top-level row.
- `children` – An array of child rows of this row.

## Testing

Tests of the tree view and data adapters have the tag `dataadapter`. There are both unit tests and
UI tests. Run `mach xpcshell-test --tag dataadapter` and `mach mochitest --tag dataadapter` to run
them all. Please tag any new tests.

Tests of the tree view elements are in mail/base/test/browser/widgets. Tests of the base data
adapter are in mail/base/test/unit, and the subclasses each have tests in their relevant components.

## Future Plans

(In no particular order.)

- Replace `nsMsgDBView` and friends with `LiveViewDataAdapter` in the [Panorama project](/panorama/index).
  Once this is complete, `TreeView` will no longer need to support `nsITreeView` and we can make
  changes that would otherwise break things.

- Remove or replace all instances of `PROTO_TREE_VIEW`, an distant ancestor of `TreeDataAdapter`.

- Convert all remaining XUL trees to AutoTreeView (or get rid of them). The remaining XUL trees are
  in little-used parts of the UI and as such have poor test coverage, so we need to be careful. And
  add test coverage.

- Refactor the about:3pane-specific code out of `TreeView`, and into about3Pane.js or somewhere
  related.

- Merge `AutoTreeView` back into `TreeView`, or at least rearrange some of the code to more logical
  places. `AutoTreeView` was created to provide more behaviour without the risk of breaking
  `TreeView`, which is some of the most important UI code in Thunderbird.

- Extract the selection code from the display code, so that we can reuse what we've already created
  in use-cases where selection is not required. For example, the chat message display.

- Investigate returning to an HTML structure that doesn't use a `<table>`, but instead has rows as
  `<div>` elements positioned by `transform` styles. This may or may not improve layout speed.

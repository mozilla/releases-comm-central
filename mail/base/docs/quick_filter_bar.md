# Quick Filter Bar

The UI for the Quick Filter Bar is split into quickFilterBar.js which operates
on the DOM and QuickFilterManager.sys.mjs, which is responsible for the state
management of the UI.

The actual filtering is done in the folder view.

The filters are made up of boolean toggles, a text filter with its own boolean
toggles, and the tags filters.

## Filter State Propagation

All UI elements that update with the state of the quick filter actions are
registered as filters to the `QuickFilterManager`. This includes for example the
result count.

The `quickFilterBar.js` plumbs the connections to the actual DOM based on the
registered filters and based on events from the DBView. That means it will call
`domBindExtra` on the filter implementation. To propagate changes in the filter
state, it uses a `QuickFilterState` instance where it calls `setFilterValue` and
then uses its `createSearchTerms` to create `QuickFilterSerchListener` instances.
If the filter definition has an `onCommand`method it is also called whenever the
UI element is interacted with and is used to provide the value that is set for
the filter.

Creating the `QuickFilterState` calls `propagateState` on the filter definition.
The state is recreated whenever the folder is switched, allowing `propagateState`
to manage the stick feature.

`createSearchTerms` on `QuickFilterState` uses `QuickFilterManager` to connect
back to the registered filter definitions and calls `appendTerms` on them.

Once the `onMessagesChanged` event is called because the filters were applied,
the special "results" filter is updated and any filter with `postFilterProcess`
has a chance to update its filter value and potentially have `reflectInDOM`
called.

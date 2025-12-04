# State management

The libraries used for state management are [Redux Toolkit](https://redux-toolkit.js.org/)
with its dependencies Redux, Reselect, Immer and Redux-Thunk. However, we should
generally only have to interact with the interface Redux Toolkit exposes.

## Typical setup

Normally a page (or document) should have exactly one Redux store being used.
The store is shared for the entire page to keep the amount of data duplication
minimal, while still easily allowing page specific state.

If we shared the state globally via system modules, all tabs with the same
document should render the same, since they should have the same state. This is
not how our user interface is expected to behave. Alternatively, pages would
have to be aware of some kind of instance identifier to query their state.
Separating the in-memory state by page simplifies this a great deal (and is
essentially what we've already beend doing).

Similarly heavily reused custom elements (like a button or an input field)
probably shouldn't store state specific to their instance in Redux and instead
continue using local state. Any state they depend on that would come from the
document's state should be passed to them with attributes or method calls, while
changes should emit events. This follows the same ideas outlined in our custom
element conventions, making self-contained custom elements that get state passed
to them by their parent.

To make it easy for custom elements to use the store of the page, we use one
module that exports the state instance for all pages:
```js
import { store } from "moz-src:///comm/mail/base/content/state/store.mjs";
```

### Implications of the store setup

Because we use a shared module to initialize the store, we can't pass in all the
reducers when the store is created. Instead, custom elements should inject the
slices they need themselves:

```js
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";
import {
  createSlice
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

// Extremely basic example slice.
const rawCustomSlice = createSlice({
  // The name is namespaced specific to this custom element.
  name: "myCustomElement/stateAspect",
  initialState: () => false,
  reducers: {
    toggle(state) {
      return !state;
    },
  },
  selectors: {
    selectValue: (state) => state,
  },
});

// Add our slice to the store and export the injected slice.
export const myCustomSlice = rawCustomSlice.injectInto(rootReducer);
```

For better separation, consider having a separate module for creating and adding
your slices to the store. This also ensures slices don't depend on local state
in a custom element module.

## Utilities for using Redux

### `storeObserver` mixin

To keep custom elements in sync with the Redux store we have a `storeObserver`
mixin. It abstracts observing the Redux store and gives a method signature
consistent with other practices we have when writing custom elements.

```js
import {
  storeObserver
} from "moz-src:///comm/mail/base/content/state/store.mjs";

class MyCustomElement extends storeObserver(HTMLElement) {
  _selectors = {
    myValue: myCustomSlice.selectors.selectValue,
  };

  connectedCallback() {
    // Get the initial state for the myValue selector.
    this.#applyMyValue(this.selectValue("myValue"));
    this.applyInitialState();
  }

  handleStateChange(name, oldValue, newValue) {
    switch(name) {
      case "myValue":
        // Handle updates to the mySelector value.
        this.#applyMyValue(newValue);
        break;
    }
  }
}
```

`selectValue` can also take arguments that will be passed to the selector for
more complex selector actions that don't depend on the current state, or need
to also consider some state that is not stored in the Redux store.

The mixin also adds a `dispose` method, which should be called when the element
is being actively discarded, so the subscription to Redux state updates can be
removed. If a subscription is not removed, the custom element will leak.

### Preference slice

There are two helpers to create a slice for a specific preference.
`createPreferenceSlice` supports all the common preference types, while
`createBoolPreferenceSlice` is pre-populated with the reducers and selectors
you'd need with a boolean preference. These slices automatically listen for
preference changes.

```js
import {
  createPreferenceSlice,
  createBoolPreferenceSlice
} from "moz-src:///comm/mail/base/content/state/preferenceSlice.mjs";

export const boolSlice = createBoolPreferenceSlice("example.bool", false);

export const prefSlice = createPreferenceSlice(
  "example.string",
  "",
  // Normalize the pref value to lower case in the redux store.
  value => value.toLowerCase(),
  {
    // Custom reducer/action pair to append a string to the pref value.
    append(state, action) {
      const newValue = state + action.payload;
      Services.prefs.setStringPref("example.string", newValue);
      return transform(newValue);
    },
  }
);
```

### XUL store slice

The `createXULStoreSlice` function simplifies synchronizing a XUL store value
with the Redux state. The slice takes a XUL store entry and initializes its
value from the XUL store and stores any updated value in the XUL store.

```js
import {
  createXULStoreSlice
} from "moz-src:///comm/mail/base/content/state/xulStoreSlice.mjs";

export const xulStoreSlice = createXULStoreSlice(
  "about:robots",
  "main",
  "collapsed"
);
```

## Creating a slice

For purely in-memory state or state stored by different mechanisms, you will
have to create your own slice using the Redux Toolkit `createSlice` helper.

You can find the full documentation for the helper in the [Redux Toolkit APIdocs](https://redux-toolkit.js.org/api/createSlice).
The following is a small excerpt for the most common uses.

Slices should be placed in a file with a name ending with `Slice.mjs`, which
will enforce additional linting.

```js
import {
  createSlice
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

export const slice = createSlice({
  name: "myCustomElement/slice",
  initialState: 0,
  reducers: {
    increment(state) {
      return state + 1;
    },
  },
  selectors: {
    selectValue: state => state,
    selectNextValue: state => state + 1,
  },
});
```

If the actual state value is an object, the reducers can just modify the object's
properties directly and don't need to return the updated object thanks to immer.

### Customizing the action creator

`createSlice` automatically generates action creators for reducers, however
sometimes the payload of the action should be processed before the action is
sent (this is mostly useful if multiple reducers consume an action, which the
next section will go into).

To do so, a reducer can be an object with two methods instead of just a function
in the slice declaration. The `reducer` property holds the function used as
reducer, while `prepare` gets to preprocess the action. It should return an
object, which will be copied into the action.

This is also [documented by Redux Toolkit](https://redux-toolkit.js.org/api/createSlice#customizing-generated-action-creators)

### Reducing foreign actions

While slices allow easy creation of reducer and action pairs, sometimes the
reducer should respond to existing actions. Reducers responding to foreign
actions can be declared with `extraReducers`. The main difference to `reducers`
being that no action creator is generated for entries. Action types declared in
other slices will also need to include the full `reducerPath` when referring to
the action here.

See more details in the [Redux Toolkit `createSlice` documentation](https://redux-toolkit.js.org/api/createSlice#extrareducers).

## Dispatching actions

Action helpers are exposed on the slice's `actions` property. The custom element
mixin exposes a `dispatch` method to seamlessly dispatch actions to the
store.

```js
import {
  storeObserver
} from "moz-src:///comm/mail/base/content/state/store.mjs";
import { myCustomSlice } from "./myCustomElementStore.mjs";

class MyCustomElement extends storeObserver(HTMLElement) {
  handleEvent(event) {
    switch(event.type) {
      case "click":
        this.dispatch(toggleStateSlice.actions.toggle());
        break;
    }
  }
}
```

## Independent selectors

When using the state to build the UI a single value might depend on multiple
slices of the state. To select the resulting value, we can create a selector
that uses the selectors of each slice it depends on to select the final value
with [`createSelector`](https://reselect.js.org/api/createselector/).

```js
import { activeItemIdSlice } from "./activeItemIdSlice.mjs";
import { itemsSlice } from "./itemsSlice.mjs";

const selectActiveItem = createSelector(
  [
    activeItemIdSlice.selectors.selectActiveItemId,
    itemsSlice.selectors.selectItems,
  ],
  (activeItemId, items) => items.find(item => item.id == activeItemId)
);

// The generated selector has the same signature as any selector, taking the
// current state as its first parameter.
const activeItem = selectActiveItem(store.getState());
```

## Other concepts

- [Thunks](https://redux-toolkit.js.org/api/createAsyncThunk)
- [Entity Adapter](https://redux-toolkit.js.org/api/createEntityAdapter)

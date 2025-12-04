/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createSlice,
  addListener,
  isAnyOf,
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { store } from "moz-src:///comm/mail/base/content/state/store.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

/**
 * Create a slice for a preference. Populated with a set and reset action/reducer
 * pair and a selectValue selector.
 *
 * The slice name is only based on the preference.
 *
 * @param {string} preference - The string path of the preference.
 * @param {any} fallbackValue - The value to use as fallback.
 * @param {Function} [transform = value => value] - A transformer for the
 *   preference value, applied before it is stored in the redux store.
 * @param {object} [extraReducers = {}] - Additional reducers (and actions) to
 *   add to the slice.
 * @returns {object} Redux slice for the preference.
 */
export const createPreferenceSlice = (
  preference,
  fallbackValue,
  transform = value => value,
  extraReducers = {}
) => {
  const sliceScope = {};
  const preferenceSlice = createSlice({
    name: `prefs/${preference}`,
    initialState: () => transform(sliceScope.pref),
    reducers: {
      ...extraReducers,
      set: (state, action) => {
        return transform(action.payload);
      },
      // Reducer/action pair for syncing the pref from a pref change.
      sync(state, action) {
        return transform(action.payload);
      },
      reset: () => {
        return transform(sliceScope.pref);
      },
    },
    selectors: {
      selectValue: state => state,
    },
  });
  XPCOMUtils.defineLazyPreferenceGetter(
    sliceScope,
    "pref",
    preference,
    fallbackValue,
    (pref, previousValue, newValue) => {
      store.dispatch(preferenceSlice.actions.sync(newValue));
    }
  );
  store.dispatch(
    addListener({
      matcher: isAnyOf(
        preferenceSlice.actions.set,
        preferenceSlice.actions.reset
      ),
      effect: action => {
        if (preferenceSlice.actions.set.match(action)) {
          switch (Services.prefs.getPrefType(preference)) {
            case Ci.nsIPrefBranch.PREF_STRING:
              Services.prefs.setStringPref(preference, action.payload);
              break;
            case Ci.nsIPrefBranch.PREF_INT:
              Services.prefs.setIntPref(preference, action.payload);
              break;
            case Ci.nsIPrefBranch.PREF_BOOL:
              Services.prefs.setBoolPref(preference, action.payload);
              break;
            case Ci.nsIPrefBranch.PREF_INVALID:
            default:
              throw new Error("Invalid preference type");
          }
        } else if (preferenceSlice.actions.reset.match(action)) {
          Services.prefs.clearUserPref(preference);
        }
      },
    })
  );
  return preferenceSlice;
};

/**
 * Create a slice for a boolean preference, populated with common actions and
 * reducers (toggle, setTrue, setFalse, set, reset) and a selectValue selector.
 *
 * The slice name is only based on the preference.
 *
 * @param {string} preference - The string path of the preference.
 * @param {boolean} fallbackValue - The boolean value to use as fallback.
 * @returns {object} A Redux slice.
 */
export const createBoolPreferenceSlice = (preference, fallbackValue) => {
  const preferenceSlice = createPreferenceSlice(
    preference,
    fallbackValue,
    value => Boolean(value),
    {
      toggle: state => {
        return !state;
      },
      setTrue: () => {
        return true;
      },
      setFalse: () => {
        return false;
      },
    }
  );
  store.dispatch(
    addListener({
      matcher: isAnyOf(
        preferenceSlice.actions.toggle,
        preferenceSlice.actions.setTrue,
        preferenceSlice.actions.setFalse
      ),
      effect: (action, context) => {
        if (preferenceSlice.actions.toggle.match(action)) {
          const state = preferenceSlice.selectors.selectValue(
            context.getOriginalState()
          );
          Services.prefs.setBoolPref(preference, !state);
        } else if (preferenceSlice.actions.setTrue.match(action)) {
          Services.prefs.setBoolPref(preference, true);
        } else if (preferenceSlice.actions.setFalse.match(action)) {
          Services.prefs.setBoolPref(preference, false);
        }
      },
    })
  );
  return preferenceSlice;
};

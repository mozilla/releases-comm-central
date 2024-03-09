/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This is a shim for SessionStore in moz-central to prevent bug 1713801. Only
 * the methods that appear to be hit by comm-central are implemented.
 */
export var SessionStore = {
  updateSessionStoreFromTablistener(aBrowser, aBrowsingContext, aData) {},
  maybeExitCrashedState() {},
};

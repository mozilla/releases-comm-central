/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Interruptions"];

var Interruptions = {
  _listeners: [],
  addListener: function(aListener) {
    if (this._listeners.indexOf(aListener) == -1)
      this._listeners.push(aListener);
  },
  removeListener: function(aListener) {
    this._listeners = this._listeners.filter(o => o !== aListener);
  },

  /* All code about to perform an action that could interrupt the
   * user's train of thoughts should call this method.
   *
   * aReason should be the notification that justifies the interruption.
   *         (eg. "new-ui-conversation", "contact-signed-on", ...)
   * aSubject should be the related object that listeners can analyse.
   *         (eg. imIConversation, imIContact, ...)
   * aType Is the action that can be prevented by denying the request.
   *       (eg. "sound", "notification", "show-conversation")
   *
   * Returns true if the request is granted, false otherwise.
   */
  requestInterrupt: function(aReason, aSubject, aType) {
    return this._listeners.every(l => l(aReason, aSubject, aType));
  }
};

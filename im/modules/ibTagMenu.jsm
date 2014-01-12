/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["TagMenu"];

const Cu = Components.utils;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://instantbird/locale/instantbird.properties")
);

// If a contact binding is given in aTarget, the menu checkmarks the existing
// tags on this contact.
function TagMenu(aParent, aWindow, aTarget = null) {
  this.parent = aParent;
  this.window = aWindow;
  if (aWindow)
    this.document = aWindow.document;
  this.target = aTarget;
}
TagMenu.prototype = {
  document: null,
  window: null,
  target: null,
  tagsPopupShowing: function() {
    if (!this.parent.onContact && !this.parent.onBuddy && !this.parent.onNick)
      return;

    let popup = this.document.getElementById("context-tags-popup");
    let item;
    while ((item = popup.firstChild) && item.localName != "menuseparator")
      popup.removeChild(item);

    if (this.target) {
      var tags = this.target.contact.getTags();
      var groupId = this.target.group.groupId;
    }

    let allTags = Services.tags.getTags().reverse();
    for (let tag of allTags) {
      item = this.document.createElement("menuitem");
      item.setAttribute("label", tag.name);
      let id = tag.id;
      item.groupId = id;
      if (this.target) {
        item.setAttribute("type", "checkbox");
        if (tags.some(function(t) t.id == id)) {
          item.setAttribute("checked", "true");
          if (tags.length == 1)
            item.setAttribute("disabled", "true"); // can't remove the last tag.
        }
      }
      popup.insertBefore(item, popup.firstChild);
    }
  },
  tag: function(aEvent, aCallback) {
    let id = aEvent.originalTarget.groupId;
    if (!id)
      return false;

    try {
      return aCallback(Services.tags.getTagById(id));
    } catch(e) {
      Cu.reportError(e);
      return false;
    }
  },
  addNewTag: function(aCallback) {
    let name = {};
    if (!Services.prompt.prompt(this.window, _("newTagPromptTitle"),
                                _("newTagPromptMessage"), name, null,
                                {value: false}) || !name.value)
      return false; // the user canceled

    try {
      // If the tag already exists, createTag will return it.
      return aCallback(Services.tags.createTag(name.value));
    } catch(e) {
      Cu.reportError(e);
      return false;
    }
  }
};

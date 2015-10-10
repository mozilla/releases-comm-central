/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["TagMenu"];

var Cu = Components.utils;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://instantbird/locale/instantbird.properties")
);

// aOnTag and aOnAddTag will be called with aParent as the this value.
// If a contact binding is given in aTarget, the menu checkmarks the existing
// tags on this contact.
function TagMenu(aParent, aWindow, aMenuId, aOnTag, aOnAddTag, aTarget = null) {
  this.parent = aParent;
  this.document = aWindow.document;
  this.target = aTarget;
  this.onAddTag = aOnAddTag;
  this.onTag = aOnTag;

  // Set up the tag menu at the menu element specified by aMenuId.
  let document = this.document;
  let menu = document.getElementById(aMenuId);
  let popup = menu.firstChild;
  if (popup)
    popup.remove();
  popup = document.createElement("menupopup");
  this.popup = popup;
  popup.addEventListener("command", this);
  popup.addEventListener("popupshowing", this);
  popup.addEventListener("popuphiding", this);
  popup.appendChild(document.createElement("menuseparator"));
  let addTagItem = document.createElement("menuitem");
  addTagItem.setAttribute("label" , _("addNewTagCmd.label"));
  addTagItem.setAttribute("accesskey", _("addNewTagCmd.accesskey"));
  addTagItem.addEventListener("command", this);
  addTagItem.isAddTagItem = true;
  popup.appendChild(addTagItem);
  menu.appendChild(popup);
}
TagMenu.prototype = {
  handleEvent: function(aEvent) {
    // Don't let events bubble as the tag menu may be a submenu of a context
    // menu with its own popupshowing handler, and as the command event
    // on the addTagItem would otherwise bubble to the popup and be handled
    // again.
    aEvent.stopPropagation();
    switch (aEvent.type) {
      case "command":
        if (aEvent.target.isAddTagItem)
          return this.addNewTag(aEvent);
        return this.tag(aEvent);
      case "popupshowing":
        return this.tagsPopupShowing(aEvent);
      case "popuphiding":
        return true;
    }
    return true;
  },
  tagsPopupShowing: function(aEvent) {
    let item;
    while ((item = this.popup.firstChild) && item.localName != "menuseparator")
      item.remove();

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
        if (tags.some(t => t.id == id)) {
          item.setAttribute("checked", "true");
          if (tags.length == 1)
            item.setAttribute("disabled", "true"); // can't remove the last tag.
        }
      }
      this.popup.insertBefore(item, this.popup.firstChild);
    }
    return true;
  },
  tag: function(aEvent) {
    let id = aEvent.originalTarget.groupId;
    if (!id)
      return false;

    try {
      return this.onTag.call(this.parent, Services.tags.getTagById(id));
    } catch(e) {
      Cu.reportError(e);
      return false;
    }
  },
  addNewTag: function(aEvent) {
    let name = {};
    if (!Services.prompt.prompt(this.document.defaultView,
                                _("newTagPromptTitle"),
                                _("newTagPromptMessage"), name, null,
                                {value: false}) || !name.value)
      return false; // the user canceled

    try {
      // If the tag already exists, createTag will return it.
      return this.onAddTag.call(this.parent,
                                Services.tags.createTag(name.value));
    } catch(e) {
      Cu.reportError(e);
      return false;
    }
  }
};

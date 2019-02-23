/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement */

/**
 * The MozDownloadViewItem widget displays information about the downloaded file:
 * e.g. downloaded file type, name, size, date and sender's name.
 * It is shown in the Saved Files view as an item of the downloaded items list.
 */

class MozDownloadsViewItem extends MozElements.MozRichlistitem {
  static get observedAttributes() {
    return ["image", "displayName", "size", "startDate", "sender"];
  }

  constructor() {
    super();

    this._image = document.createElement("image");
    this._image.setAttribute("validate", "always");
    this._image.classList.add("fileTypeIcon");

    this._vbox = document.createElement("vbox");
    this._vbox.setAttribute("pack", "center");
    this._vbox.setAttribute("flex", "1");

    this._sender = document.createElement("description");
    this._sender.classList.add("sender");

    this._fileName = document.createElement("description");
    this._fileName.setAttribute("crop", "center");
    this._fileName.classList.add("fileName");

    this._size = document.createElement("description");
    this._size.classList.add("size");

    this._startDate = document.createElement("description");
    this._startDate.setAttribute("crop", "end");
    this._startDate.classList.add("startDate");

    this._vbox.appendChild(this._fileName);
    this._vbox.appendChild(this._size);
    this._vbox.appendChild(this._startDate);

    this.appendChild(this._image);
    this.appendChild(this._vbox);
    this.appendChild(this._sender);
  }

  connectedCallback() {
    this._updateAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.firstChild) {
      return;
    }
    this._updateAttributes();
  }

  _updateAttributes() {
    this._image.setAttribute("src", this.getAttribute("image"));

    this._fileName.setAttribute("value", this.getAttribute("displayName"));
    this._fileName.setAttribute("tooltiptext", this.getAttribute("displayName"));

    this._size.setAttribute("value", this.getAttribute("size"));
    this._size.setAttribute("tooltiptext", this.getAttribute("size"));

    this._startDate.setAttribute("value", this.getAttribute("startDate"));
    this._startDate.setAttribute("tooltiptext", this.getAttribute("startDate"));

    this._sender.setAttribute("value", this.getAttribute("sender"));
    this._sender.setAttribute("tooltiptext", this.getAttribute("sender"));
  }
}

MozXULElement.implementCustomInterface(
  MozDownloadsViewItem, [Ci.nsIDOMXULSelectControlItemElement]
);

customElements.define("downloads-view-item", MozDownloadsViewItem, { extends: "richlistitem" });

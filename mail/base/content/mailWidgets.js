/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement, openUILink */

class MozMailHeaderfield extends MozXULElement {
  connectedCallback() {
    this.setAttribute("context", "copyPopup");
    this.classList.add("headerValue");
  }

  set headerValue(val) {
    return (this.textContent = val);
  }
}

class MozMailUrlfield extends MozMailHeaderfield {
  connectedCallback() {
    super.connectedCallback();
    this.classList.add("text-link", "headerValueUrl");
    this.addEventListener("click", (event) => {
      if (event.button != 2) {
        openUILink(encodeURI(event.target.textContent), event);
      }
    });
  }
}

class MozMailHeaderfieldTags extends MozXULElement {
  connectedCallback() {
    this.classList.add("headerValue");
    ChromeUtils.import("resource:///modules/MailServices.jsm");
  }

  set headerValue(val) {
    return this.buildTags(val);
  }

  buildTags(tags) {
    // tags contains a list of actual tag names (not the keys), delimited by spaces
    // each tag name is encoded.

    // remove any existing tag items we've appended to the list
    while (this.hasChildNodes()) {
      this.lastChild.remove();
    }

    // tokenize the keywords based on ' '
    const tagsArray = tags.split(" ");
    for (let i = 0; i < tagsArray.length; i++) {
      // for each tag, create a label, give it the font color that corresponds to the
      // color of the tag and append it.
      let tagName;
      try {
        // if we got a bad tag name, getTagForKey will throw an exception, skip it
        // and go to the next one.
        tagName = MailServices.tags.getTagForKey(tagsArray[i]);
      } catch (ex) {
        continue;
      }

      let color = MailServices.tags.getColorForKey(tagsArray[i]);

      // now create a label for the tag name, and set the color
      const label = document.createElement("label");
      label.setAttribute("value", tagName);
      label.className = "tagvalue blc-" + color.substr(1);

      this.appendChild(label);
    }
  }
}

customElements.define("mail-headerfield", MozMailHeaderfield);
customElements.define("mail-urlfield", MozMailUrlfield);
customElements.define("mail-tagfield", MozMailHeaderfieldTags);

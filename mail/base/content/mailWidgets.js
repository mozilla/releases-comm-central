/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* global openUILink */
/* global MessageIdClick */
/* global onClickEmailStar */
/* global onClickEmailPresence */

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
    this.setAttribute("context", "copyUrlPopup");
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
  }

  set headerValue(val) {
    return this.buildTags(val);
  }

  buildTags(tags) {
    var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
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

class MozMailNewsgroup extends MozXULElement {
  connectedCallback() {
    this.classList.add("emailDisplayButton");
    this.setAttribute("context", "newsgroupPopup");
    this.setAttribute("popup", "newsgroupPopup");
  }
}

class MozMailNewsgroupsHeaderfield extends MozXULElement {
  connectedCallback() {
    this.classList.add("headerValueBox");
    this.mNewsgroups = [];
  }

  addNewsgroupView(aNewsgroup) {
    this.mNewsgroups.push(aNewsgroup);
  }

  buildViews() {
    for (let i = 0; i < this.mNewsgroups.length; i++) {
      const newNode = document.createElement("mail-newsgroup");
      if (i > 0) {
        const textNode = document.createElement("text");
        textNode.setAttribute("value", ",");
        textNode.setAttribute("class", "newsgroupSeparator");
        this.appendChild(textNode);
      }

      newNode.textContent = this.mNewsgroups[i];
      newNode.setAttribute("newsgroup", this.mNewsgroups[i]);
      this.appendChild(newNode);
    }
  }

  clearHeaderValues() {
    this.mNewsgroups = [];
    while (this.hasChildNodes()) {
      this.lastChild.remove();
    }
  }
}

class MozMailMessageid extends MozXULElement {
  static get observedAttributes() {
    return ["label"];
  }

  connectedCallback() {
    this.classList.add("messageIdDisplayButton");
    this.setAttribute("context", "messageIdContext");
    this._updateAttributes();

    this.addEventListener("click", (event) => {
      MessageIdClick(this, event);
    });
  }

  attributeChangedCallback() {
    this._updateAttributes();
  }

  _updateAttributes() {
    this.textContent = this.label || "";
  }

  set label(val) {
    if (val == null) {
      this.removeAttribute("label");
    } else {
      this.setAttribute("label", val);
    }

    return val;
  }

  get label() {
    return this.getAttribute("label");
  }
}

class MozMailEmailaddress extends MozXULElement {
  static get observedAttributes() {
    return [
      "hascard",
      "label",
      "crop",
      "tooltipstar",
      "chatStatus",
      "presenceTooltip",
    ];
  }

  connectedCallback() {
    this.classList.add("emailDisplayButton");
    this.setAttribute("context", "emailAddressPopup");
    this.setAttribute("popup", "emailAddressPopup");

    const label = document.createElement("label");
    label.classList.add("emaillabel");

    const emailStarImage = document.createElement("image");
    emailStarImage.classList.add("emailStar");
    emailStarImage.setAttribute("context", "emailAddressPopup");

    const emailPresenceImage = document.createElement("image");
    emailPresenceImage.classList.add("emailPresence");

    this.appendChild(label);
    this.appendChild(emailStarImage);
    this.appendChild(emailPresenceImage);

    this._areChildrenAppended = true;

    this._update();
    this._setupEventListeners();
  }

  attributeChangedCallback() {
    this._update();
  }

  _update() {
    if (!this.isConnected || !this._areChildrenAppended) {
      return;
    }

    const emailLabel = this.querySelector(".emaillabel");
    const emailStarImage = this.querySelector(".emailStar");
    const emailPresenceImage = this.querySelector(".emailPresence");

    this._updateNodeAttributes(emailLabel, "crop");
    this._updateNodeAttributes(emailLabel, "value", "label");

    this._updateNodeAttributes(emailStarImage, "hascard");
    this._updateNodeAttributes(emailStarImage, "chatStatus");
    this._updateNodeAttributes(emailStarImage, "tooltiptext", "tooltipstar");

    this._updateNodeAttributes(emailPresenceImage, "chatStatus");
    this._updateNodeAttributes(
      emailPresenceImage, "tooltiptext", "presenceTooltip"
    );
  }

  _updateNodeAttributes(attrNode, attr, mappedAttr) {
    mappedAttr = mappedAttr || attr;

    if (this.hasAttribute(mappedAttr) && (this.getAttribute(mappedAttr) != null)) {
      attrNode.setAttribute(attr, this.getAttribute(mappedAttr));
    } else {
      attrNode.removeAttribute(attr);
    }
  }

  _setupEventListeners() {
    const emailStarImage = this.querySelector(".emailStar");
    const emailPresenceImage = this.querySelector(".emailPresence");

    emailStarImage.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    emailStarImage.addEventListener("click", (event) => {
      onClickEmailStar(event, this);
    });

    emailPresenceImage.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    emailPresenceImage.addEventListener("click", (event) => {
      onClickEmailPresence(event, this);
    });
  }
}

class MozMailEmailheaderfield extends MozXULElement {
  connectedCallback() {
    this._mailEmailAddress = document.createElement("mail-emailaddress");
    this._mailEmailAddress.classList.add("headerValue");
    this._mailEmailAddress.setAttribute("containsEmail", "true");

    this.appendChild(this._mailEmailAddress);
  }

  get emailAddressNode() {
    return this._mailEmailAddress;
  }
}

class MozTreecolImage extends customElements.get("treecol") {
  static get observedAttributes() {
    return ["src"];
  }

  connectedCallback() {
    this.image = document.createElement("image");
    this.image.classList.add("treecol-icon");

    this.appendChild(this.image);
    this._updateAttributes();
  }

  attributeChangedCallback() {
    this._updateAttributes();
  }

  _updateAttributes() {
    if (!this.isConnected || !this.image) {
      return;
    }

    const src = this.getAttribute("src");

    if (src != null) {
      this.image.setAttribute("src", src);
    } else {
      this.image.removeAttribute("src");
    }
  }
}

customElements.define("mail-headerfield", MozMailHeaderfield);
customElements.define("mail-urlfield", MozMailUrlfield);
customElements.define("mail-tagfield", MozMailHeaderfieldTags);
customElements.define("mail-newsgroup", MozMailNewsgroup);
customElements.define("mail-newsgroups-headerfield", MozMailNewsgroupsHeaderfield);
customElements.define("mail-messageid", MozMailMessageid);
customElements.define("mail-emailaddress", MozMailEmailaddress);
customElements.define("mail-emailheaderfield", MozMailEmailheaderfield);
customElements.define("treecol-image", MozTreecolImage, { extends: "treecol" });

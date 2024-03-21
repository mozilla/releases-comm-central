/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from MsgComposeCommands.js */

const { MsgUtils } = ChromeUtils.importESModule(
  "resource:///modules/MimeMessageUtils.sys.mjs"
);

var gCloudAttachmentLinkManager = {
  init() {
    this.cloudAttachments = [];

    const bucket = document.getElementById("attachmentBucket");
    bucket.addEventListener("attachments-removed", this);
    bucket.addEventListener("attachment-converted-to-regular", this);
    bucket.addEventListener("attachment-uploaded", this);
    bucket.addEventListener("attachment-moved", this);
    bucket.addEventListener("attachment-renamed", this);

    // If we're restoring a draft that has some attachments,
    // check to see if any of them are marked to be sent via
    // cloud, and if so, add them to our list.
    for (let i = 0; i < bucket.getRowCount(); ++i) {
      const attachment = bucket.getItemAtIndex(i).attachment;
      if (attachment && attachment.sendViaCloud) {
        this.cloudAttachments.push(attachment);
      }
    }

    gMsgCompose.RegisterStateListener(this);
  },

  NotifyComposeFieldsReady() {},
  NotifyComposeBodyReady() {},
  ComposeProcessDone() {},
  SaveInFolderDone() {},

  async handleEvent(event) {
    const mailDoc = document.getElementById("messageEditor").contentDocument;

    if (
      event.type == "attachment-renamed" ||
      event.type == "attachment-moved"
    ) {
      const cloudFileUpload = event.target.cloudFileUpload;
      let items = [];

      const list = mailDoc.getElementById("cloudAttachmentList");
      if (list) {
        items = list.getElementsByClassName("cloudAttachmentItem");
      }

      for (const item of items) {
        // The original attachment is stored in the events detail property.
        if (item.dataset.contentLocation == event.detail.contentLocation) {
          item.replaceWith(await this._createNode(mailDoc, cloudFileUpload));
        }
      }
      if (event.type == "attachment-moved") {
        await this._updateServiceProviderLinks(mailDoc);
      }
    } else if (event.type == "attachment-uploaded") {
      if (this.cloudAttachments.length == 0) {
        this._insertHeader(mailDoc);
      }

      const cloudFileUpload = event.target.cloudFileUpload;
      const attachment = event.target.attachment;
      this.cloudAttachments.push(attachment);
      await this._insertItem(mailDoc, cloudFileUpload);
    } else if (
      event.type == "attachments-removed" ||
      event.type == "attachment-converted-to-regular"
    ) {
      let items = [];
      const list = mailDoc.getElementById("cloudAttachmentList");
      if (list) {
        items = list.getElementsByClassName("cloudAttachmentItem");
      }

      const attachments = Array.isArray(event.detail)
        ? event.detail
        : [event.detail];
      for (const attachment of attachments) {
        // Remove the attachment from the message body.
        if (list) {
          for (const item of items) {
            if (item.dataset.contentLocation == attachment.contentLocation) {
              item.remove();
            }
          }
        }

        // Now, remove the attachment from our internal list.
        const index = this.cloudAttachments.indexOf(attachment);
        if (index != -1) {
          this.cloudAttachments.splice(index, 1);
        }
      }

      await this._updateAttachmentCount(mailDoc);
      await this._updateServiceProviderLinks(mailDoc);

      if (items.length == 0) {
        if (list) {
          list.remove();
        }
        this._removeRoot(mailDoc);
      }
    }
  },

  /**
   * Removes the root node for an attachment list in an HTML email.
   *
   * @param {Document} aDocument - the document to remove the root node from
   */
  _removeRoot(aDocument) {
    const header = aDocument.getElementById("cloudAttachmentListRoot");
    if (header) {
      header.remove();
    }
  },

  /**
   * Given some node, returns the textual HTML representation for the node
   * and its children.
   *
   * @param {Document} aDocument - the document that the node is embedded in
   * @param {DOMNode} aNode - the node to get the textual representation from
   */
  _getHTMLRepresentation(aDocument, aNode) {
    const tmp = aDocument.createElement("p");
    tmp.appendChild(aNode);
    return tmp.innerHTML;
  },

  /**
   * Returns the plain text equivalent of the given HTML markup, ready to be
   * inserted into a compose editor.
   *
   * @param {string} aMarkup - the HTML markup that should be converted
   */
  _getTextRepresentation(aMarkup) {
    return MsgUtils.convertToPlainText(aMarkup, true).replaceAll("\r\n", "\n");
  },

  /**
   * Generates an appropriately styled link.
   *
   * @param {Document} aDocument - the document to append the link to - doesn't
   *   actually get appended, but is used to generate the anchor node
   * @param {string} aContent - the textual content of the link
   * @param {string} aHref - the HREF attribute for the generated link
   * @param {string} aColor - the CSS color string for the link
   */
  _generateLink(aDocument, aContent, aHref, aColor) {
    const link = aDocument.createElement("a");
    link.href = aHref;
    link.textContent = aContent;
    link.style.cssText = `color: ${aColor} !important`;
    return link;
  },

  _findInsertionPoint(aDocument) {
    const mailBody = aDocument.querySelector("body");
    const editor = GetCurrentEditor();
    const selection = editor.selection;

    const childNodes = mailBody.childNodes;
    let childToInsertAfter, childIndex;

    // First, search for any text nodes that are immediate children of
    // the body.  If we find any, we'll insert after those.
    for (childIndex = childNodes.length - 1; childIndex >= 0; childIndex--) {
      if (childNodes[childIndex].nodeType == Node.TEXT_NODE) {
        childToInsertAfter = childNodes[childIndex];
        break;
      }
    }

    if (childIndex != -1) {
      selection.collapse(
        childToInsertAfter,
        childToInsertAfter.nodeValue ? childToInsertAfter.nodeValue.length : 0
      );
      if (
        childToInsertAfter.nodeValue &&
        childToInsertAfter.nodeValue.length > 0
      ) {
        editor.insertLineBreak();
      }
      editor.insertLineBreak();
      return;
    }

    // If there's a signature, let's get a hold of it now.
    const signature = mailBody.querySelector(".moz-signature");

    // Are we replying?
    const replyCitation = mailBody.querySelector(".moz-cite-prefix");
    if (replyCitation) {
      if (gCurrentIdentity && gCurrentIdentity.replyOnTop == 0) {
        // Replying below quote - we'll select the point right before
        // the signature.  If there's no signature, we'll just use the
        // last node.
        if (signature && signature.previousSibling) {
          selection.collapse(
            mailBody,
            Array.from(childNodes).indexOf(signature.previousSibling)
          );
        } else {
          selection.collapse(mailBody, childNodes.length - 1);
          editor.insertLineBreak();

          if (!gMsgCompose.composeHTML) {
            editor.insertLineBreak();
          }

          selection.collapse(mailBody, childNodes.length - 2);
        }
      } else if (replyCitation.previousSibling) {
        // Replying above quote
        let nodeIndex = Array.from(childNodes).indexOf(
          replyCitation.previousSibling
        );
        if (nodeIndex <= 0) {
          editor.insertLineBreak();
          nodeIndex = 1;
        }
        selection.collapse(mailBody, nodeIndex);
      } else {
        editor.beginningOfDocument();
        editor.insertLineBreak();
      }
      return;
    }

    // Are we forwarding?
    const forwardBody = mailBody.querySelector(".moz-forward-container");
    if (forwardBody) {
      if (forwardBody.previousSibling) {
        let nodeIndex = Array.from(childNodes).indexOf(
          forwardBody.previousSibling
        );
        if (nodeIndex <= 0) {
          editor.insertLineBreak();
          nodeIndex = 1;
        }
        // If we're forwarding, insert just before the forward body.
        selection.collapse(mailBody, nodeIndex);
      } else {
        // Just insert after a linebreak at the top.
        editor.beginningOfDocument();
        editor.insertLineBreak();
        selection.collapse(mailBody, 1);
      }
      return;
    }

    // If we haven't figured it out at this point, let's see if there's a
    // signature, and just insert before it.
    if (signature && signature.previousSibling) {
      let nodeIndex = Array.from(childNodes).indexOf(signature.previousSibling);
      if (nodeIndex <= 0) {
        editor.insertLineBreak();
        nodeIndex = 1;
      }
      selection.collapse(mailBody, nodeIndex);
      return;
    }

    // If we haven't figured it out at this point, let's just put it
    // at the bottom of the message body.  If the "bottom" is also the top,
    // then we'll insert a linebreak just above it.
    let nodeIndex = childNodes.length - 1;
    if (nodeIndex <= 0) {
      editor.insertLineBreak();
      nodeIndex = 1;
    }
    selection.collapse(mailBody, nodeIndex);
  },

  /**
   * Attempts to find any elements with an id in aIDs, and sets those elements
   * id attribute to the empty string, freeing up the ids for later use.
   *
   * @param {Document} aDocument - the document to search for the elements
   * @param {string[]} aIDs - an array of id strings
   */
  _resetNodeIDs(aDocument, aIDs) {
    for (const id of aIDs) {
      const node = aDocument.getElementById(id);
      if (node) {
        node.id = "";
      }
    }
  },

  /**
   * Insert the header for the cloud attachment list, which we'll use to
   * as an insertion point for the individual cloud attachments.
   *
   * @param {Document} aDocument - the document to insert the header into
   */
  _insertHeader(aDocument) {
    // If there already exists a cloudAttachmentListRoot,
    // cloudAttachmentListHeader, cloudAttachmentListFooter or
    // cloudAttachmentList in the document, strip them of their IDs so that we
    // don't conflict with them.
    this._resetNodeIDs(aDocument, [
      "cloudAttachmentListRoot",
      "cloudAttachmentListHeader",
      "cloudAttachmentList",
      "cloudAttachmentListFooter",
    ]);

    const editor = GetCurrentEditor();
    const selection = editor.selection;
    const originalAnchor = selection.anchorNode;
    const originalOffset = selection.anchorOffset;

    // Save off the selection ranges so we can restore them later.
    const ranges = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i));
    }

    this._findInsertionPoint(aDocument);

    const root = editor.createElementWithDefaults("div");
    const header = editor.createElementWithDefaults("div");
    let list = editor.createElementWithDefaults("div");
    const footer = editor.createElementWithDefaults("div");

    if (gMsgCompose.composeHTML) {
      root.style.padding = "15px";
      root.style.backgroundColor = "#D9EDFF";

      header.style.marginBottom = "15px";

      list = editor.createElementWithDefaults("ul");
      list.style.backgroundColor = "#FFFFFF";
      list.style.padding = "15px";
      list.style.listStyleType = "none";
      list.display = "inline-block";
    }

    root.id = "cloudAttachmentListRoot";
    header.id = "cloudAttachmentListHeader";
    list.id = "cloudAttachmentList";
    footer.id = "cloudAttachmentListFooter";

    // It's really quite strange, but if we don't set
    // the innerHTML of each element to be non-empty, then
    // the nodes fail to be added to the compose window.
    root.innerHTML = " ";
    header.innerHTML = " ";
    list.innerHTML = " ";
    footer.innerHTML = " ";

    root.appendChild(header);
    root.appendChild(list);
    root.appendChild(footer);
    editor.insertElementAtSelection(root, false);
    if (!root.previousSibling || root.previousSibling.localName == "span") {
      root.parentNode.insertBefore(editor.document.createElement("br"), root);
    }

    // Remove the space, which would end up in the plain text converted
    // version.
    list.innerHTML = "";
    selection.collapse(originalAnchor, originalOffset);

    // Restore the selection ranges.
    for (const range of ranges) {
      selection.addRange(range);
    }
  },

  /**
   * Updates the count of how many attachments have been added
   * in HTML emails.
   *
   * @param {Document} aDocument - the document that contains the header node
   */
  async _updateAttachmentCount(aDocument) {
    const header = aDocument.getElementById("cloudAttachmentListHeader");
    if (!header) {
      return;
    }

    const entries = aDocument.querySelectorAll(
      "#cloudAttachmentList > .cloudAttachmentItem"
    );

    header.textContent = await l10nCompose.formatValue(
      "cloud-file-count-header",
      {
        count: entries.length,
      }
    );
  },

  /**
   * Updates the service provider links in the footer.
   *
   * @param {Document} aDocument - the document that contains the footer node
   */
  async _updateServiceProviderLinks(aDocument) {
    const footer = aDocument.getElementById("cloudAttachmentListFooter");
    if (!footer) {
      return;
    }

    const providers = [];
    const entries = aDocument.querySelectorAll(
      "#cloudAttachmentList > .cloudAttachmentItem"
    );
    for (const entry of entries) {
      if (!entry.dataset.serviceUrl) {
        continue;
      }

      const link_markup = this._generateLink(
        aDocument,
        entry.dataset.serviceName,
        entry.dataset.serviceUrl,
        "dark-grey"
      ).outerHTML;

      if (!providers.includes(link_markup)) {
        providers.push(link_markup);
      }
    }

    let content = "";
    if (providers.length == 1) {
      content = await l10nCompose.formatValue(
        "cloud-file-service-provider-footer-single",
        {
          link: providers[0],
        }
      );
    } else if (providers.length > 1) {
      const lastLink = providers.pop();
      const firstLinks = providers.join(", ");
      content = await l10nCompose.formatValue(
        "cloud-file-service-provider-footer-multiple",
        {
          firstLinks,
          lastLink,
        }
      );
    }

    if (gMsgCompose.composeHTML) {
      // eslint-disable-next-line no-unsanitized/property
      footer.innerHTML = content;
    } else {
      footer.textContent = this._getTextRepresentation(content);
    }
  },

  /**
   * Insert the information for a cloud attachment.
   *
   * @param {Document} aDocument - the document to insert the item into
   * @param {CloudFileTemplate} aCloudFileUpload - object with information about
   *   the uploaded file
   */
  async _insertItem(aDocument, aCloudFileUpload) {
    let list = aDocument.getElementById("cloudAttachmentList");

    if (!list) {
      this._insertHeader(aDocument);
      list = aDocument.getElementById("cloudAttachmentList");
    }
    list.appendChild(await this._createNode(aDocument, aCloudFileUpload));
    await this._updateAttachmentCount(aDocument);
    await this._updateServiceProviderLinks(aDocument);
  },

  /**
   * @typedef CloudFileDate
   * @property {integer} timestamp - milliseconds since epoch
   * @property {DateTimeFormat} format - format object of Intl.DateTimeFormat
   */

  /**
   * @typedef CloudFileTemplate
   * @property {string} serviceName - name of the upload service provider
   * @property {string} serviceIcon - icon of the upload service provider
   * @property {string} serviceUrl - web interface of the upload service provider
   * @property {boolean} downloadPasswordProtected - link is password protected
   * @property {integer} downloadLimit - download limit of the link
   * @property {CloudFileDate} downloadExpiryDate - expiry date of the link
   */

  /**
   * Create the link node for a cloud attachment.
   *
   * @param {Document} aDocument - the document to insert the item into
   * @param {CloudFileTemplate} aCloudFileUpload - object with information about
   *   the uploaded file
   * @param {boolean} composeHTML - override gMsgCompose.composeHTML
   */
  async _createNode(
    aDocument,
    aCloudFileUpload,
    composeHTML = gMsgCompose.composeHTML
  ) {
    const iconSize = 32;
    const locales = {
      service: 0,
      size: 1,
      link: 2,
      "password-protected-link": 3,
      "expiry-date": 4,
      "download-limit": 5,
      "tooltip-password-protected-link": 6,
    };

    const l10n_values = await l10nCompose.formatValues([
      { id: "cloud-file-template-service-name" },
      { id: "cloud-file-template-size" },
      { id: "cloud-file-template-link" },
      { id: "cloud-file-template-password-protected-link" },
      { id: "cloud-file-template-expiry-date" },
      { id: "cloud-file-template-download-limit" },
      { id: "cloud-file-tooltip-password-protected-link" },
    ]);

    let node = aDocument.createElement("li");
    node.style.border = "1px solid #CDCDCD";
    node.style.borderRadius = "5px";
    node.style.marginTop = "10px";
    node.style.marginBottom = "10px";
    node.style.padding = "15px";
    node.style.display = "grid";
    node.style.gridTemplateColumns = "0fr 1fr 0fr 0fr";
    node.style.alignItems = "center";

    const statsRow = (name, content, contentLink) => {
      const entry = aDocument.createElement("span");
      entry.style.gridColumn = `2 / span 3`;
      entry.style.fontSize = "small";

      const description = aDocument.createElement("span");
      description.style.color = "dark-grey";
      description.textContent = `${l10n_values[locales[name]]} `;
      entry.appendChild(description);

      let value;
      if (composeHTML && contentLink) {
        value = this._generateLink(aDocument, content, contentLink, "#595959");
      } else {
        value = aDocument.createElement("span");
        value.style.color = "#595959";
        value.textContent = content;
      }
      value.classList.add(`cloudfile-${name}`);
      entry.appendChild(value);

      entry.appendChild(aDocument.createElement("br"));
      return entry;
    };

    const serviceRow = () => {
      const service = aDocument.createDocumentFragment();

      const description = aDocument.createElement("span");
      description.style.display = "none";
      description.textContent = `${l10n_values[locales.service]} `;
      service.appendChild(description);

      const providerName = aDocument.createElement("span");
      providerName.style.gridArea = "1 / 4";
      providerName.style.color = "#595959";
      providerName.style.fontSize = "small";
      providerName.textContent = aCloudFileUpload.serviceName;
      providerName.classList.add("cloudfile-service-name");
      service.appendChild(providerName);

      service.appendChild(aDocument.createElement("br"));
      return service;
    };

    // If this message is send in plain text only, do not add a link to the file
    // name.
    let name = aDocument.createElement("span");
    name.textContent = aCloudFileUpload.name;
    if (composeHTML) {
      name = this._generateLink(
        aDocument,
        aCloudFileUpload.name,
        aCloudFileUpload.url,
        "#0F7EDB"
      );
      name.setAttribute("moz-do-not-send", "true");
      name.style.gridArea = "1 / 2";
    }
    name.classList.add("cloudfile-name");
    node.appendChild(name);

    const paperclip = aDocument.createElement("img");
    paperclip.classList.add("paperClipIcon");
    paperclip.style.gridArea = "1 / 1";
    paperclip.alt = "";
    paperclip.style.marginRight = "5px";
    paperclip.width = `${iconSize}`;
    paperclip.height = `${iconSize}`;
    if (aCloudFileUpload.downloadPasswordProtected) {
      paperclip.title = l10n_values[locales["tooltip-password-protected-link"]];
      paperclip.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIfSURBVFhH7ZfLK0RRHMfvNd6PMV4Lj5UkO5bslJIdf4ClRw2TlY2yt2EhsZO9DYoFoiSvJBZkI6SsNMyIiLnH93vmXDF5HNe9pHzqM797fufMPb+Zc4Z7jC+QBnvgJryD93AddkH2eUop3IPiHXdgCfSEdLgLOdE+bIFFSl4zZxeRAl2HXzsn2IIZTCTAHPs4hsvhOlxz3rxRtt6GfRyzJlsucw1582zZehv2cUxEtlyGN6afkThuFa7EL7+H0wK03pek4q/xJwtYVv4YumurO+4V/3vgvwAvC5iHTfHL9zFV/Ah7J9tjE9s2r/K3YwWlD8IaREP+ExPCWBDJVl+gM3LEto0nBURHCiuNpBiflvLjqWcufDFfdVbo4ly1PVoC0xrAaz4qnLdiVjk1hVhArvDRFxuSYxQeFSAaGHzCbAuEIsf0URjtsithX3i1Cf18yewKn8kWyOu+OlWXuSpKnBRwpWKxioTXi7BCtr6Ak004BZvhJAwyAUZhb3Q0bwKxXmY+xVzyB8MNOgXwE/NrC0A+clXBDZV7iYkC7GK18AcvTZ0lOFGRE5NDWAtn4A28hdPQEToFcG1Jq4qERXAZ+DCaBXk+cIROAePQgh2whgk30SngAA7CVDgLq6Fr6P4M++Ec5PmPp6BhWAdzIA+m3BOO0C2AJ2GuMyfme0KQp6Ao5EmZf/fLDGFuI2oi+EEcUQm5JDywhpWc2MFGNIwn/WmcKhqF50UAAAAASUVORK5CYII=";
    } else {
      paperclip.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAVFJREFUWIXtl8FKw0AQhj8EbQ/p0Ut8AVEPgYLUB+i5L6J9E0Wtr1HPgl48WU8K1Tfw4LktxUAhHvZfiMXUbdhVhB0Yms78M/NldwkJuFsD6AMjYCYfASfKBbUd4BkoKvxJmiDWKA1/AXrAtrynmIUIshJ9DXgEmt/km8oVwHEIANu8u0LTleYhBMBUzZMVmkSaSQgAe9DW1d3L/wzAqW6jJpQ3+5cA3vbW1Vz3Np6BCBABIkAE+DWAmX7TUixdynm15Wf6jf5fa3Cq60K5qrraNuHrK1kbmJcGWJ8rB9DC4yvaq5odlmK7wBB4lw8Vs9ZRzdgHwLmaXa5RM1DNmQ+AA2ABfACZgz4DctXs+QAAuMLc0dsPEJk0BXDhazjAFnCnxjlmiTuYg5kAR4rl0twCmz4BLMQAs7RVH6kLzJ17H162fczhGmO+mqa6PqXGnn8CxMN0PcC9DrQAAAAASUVORK5CYII=";
    }
    node.appendChild(paperclip);

    const serviceIcon = aDocument.createElement("img");
    serviceIcon.classList.add("cloudfile-service-icon");
    serviceIcon.style.gridArea = "1 / 3";
    serviceIcon.alt = "";
    serviceIcon.style.margin = "0 5px";
    serviceIcon.width = `${iconSize}`;
    serviceIcon.height = `${iconSize}`;
    node.appendChild(serviceIcon);

    if (aCloudFileUpload.serviceIcon) {
      if (!/^(chrome|moz-extension):\/\//i.test(aCloudFileUpload.serviceIcon)) {
        serviceIcon.src = aCloudFileUpload.serviceIcon;
      } else {
        try {
          // Let's use the goodness from MsgComposeCommands.js since we're
          // sitting right in a compose window.
          serviceIcon.src = window.loadBlockedImage(
            aCloudFileUpload.serviceIcon,
            true
          );
        } catch (e) {
          // Couldn't load the referenced image.
          console.error(e);
        }
      }
    }
    node.appendChild(aDocument.createElement("br"));

    node.appendChild(
      statsRow("size", gMessenger.formatFileSize(aCloudFileUpload.size))
    );

    if (aCloudFileUpload.downloadExpiryDate) {
      node.appendChild(
        statsRow(
          "expiry-date",
          new Date(
            aCloudFileUpload.downloadExpiryDate.timestamp
          ).toLocaleString(
            undefined,
            aCloudFileUpload.downloadExpiryDate.format || {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            }
          )
        )
      );
    }

    if (aCloudFileUpload.downloadLimit) {
      node.appendChild(
        statsRow("download-limit", aCloudFileUpload.downloadLimit)
      );
    }

    if (composeHTML || aCloudFileUpload.serviceUrl) {
      node.appendChild(serviceRow());
    }

    const linkElementLocaleId = aCloudFileUpload.downloadPasswordProtected
      ? "password-protected-link"
      : "link";
    node.appendChild(
      statsRow(linkElementLocaleId, aCloudFileUpload.url, aCloudFileUpload.url)
    );

    // An extra line break is needed for the converted plain text version, if it
    // should have a gap between its <li> elements.
    if (composeHTML) {
      node.appendChild(aDocument.createElement("br"));
    }

    // Generate the plain text version from the HTML. The used method needs a <ul>
    // element wrapped around the <li> element to produce the correct content.
    if (!composeHTML) {
      const ul = aDocument.createElement("ul");
      ul.appendChild(node);
      node = aDocument.createElement("p");
      node.textContent = this._getTextRepresentation(ul.outerHTML);
    }

    node.className = "cloudAttachmentItem";
    node.dataset.contentLocation = aCloudFileUpload.url;
    node.dataset.serviceName = aCloudFileUpload.serviceName;
    node.dataset.serviceUrl = aCloudFileUpload.serviceUrl;
    return node;
  },

  /**
   * Event handler for when mail is sent.  For mail that is being sent
   * (and not saved!), find any cloudAttachmentList* nodes that we've created,
   * and strip their IDs out.  That way, if the receiving user replies by
   * sending some BigFiles, we don't run into ID conflicts.
   * @param {CustomEvent} aEvent - The "compose-send-message" event.
   */
  send(aEvent) {
    const msgType = aEvent.detail.msgType;

    if (
      msgType == Ci.nsIMsgCompDeliverMode.Now ||
      msgType == Ci.nsIMsgCompDeliverMode.Later ||
      msgType == Ci.nsIMsgCompDeliverMode.Background
    ) {
      const kIDs = [
        "cloudAttachmentListRoot",
        "cloudAttachmentListHeader",
        "cloudAttachmentList",
        "cloudAttachmentListFooter",
      ];
      const mailDoc = document.getElementById("messageEditor").contentDocument;

      for (const id of kIDs) {
        const element = mailDoc.getElementById(id);
        if (element) {
          element.removeAttribute("id");
        }
      }
    }
  },
};

window.addEventListener(
  "compose-window-init",
  gCloudAttachmentLinkManager.init.bind(gCloudAttachmentLinkManager),
  true
);
window.addEventListener(
  "compose-send-message",
  gCloudAttachmentLinkManager.send.bind(gCloudAttachmentLinkManager),
  true
);

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from MsgComposeCommands.js */

var gCloudAttachmentLinkManager = {
  init() {
    this.cloudAttachments = [];

    let bucket = document.getElementById("attachmentBucket");
    bucket.addEventListener("attachment-uploaded", this);
    bucket.addEventListener("attachments-removed", this);
    bucket.addEventListener("attachments-converted", this);

    // If we're restoring a draft that has some attachments,
    // check to see if any of them are marked to be sent via
    // cloud, and if so, add them to our list.
    for (let i = 0; i < bucket.getRowCount(); ++i) {
      let attachment = bucket.getItemAtIndex(i).attachment;
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

  handleEvent(event) {
    let mailDoc = document.getElementById("content-frame").contentDocument;

    if (event.type == "attachment-uploaded") {
      if (this.cloudAttachments.length == 0) {
        this._insertHeader(mailDoc);
      }

      let attachment = event.target.attachment;
      let account = event.target.cloudFileAccount;
      this.cloudAttachments.push(attachment);
      this._insertItem(mailDoc, attachment, account);
    } else if (
      event.type == "attachments-removed" ||
      event.type == "attachments-converted"
    ) {
      let items = [];
      let list = mailDoc.getElementById("cloudAttachmentList");
      if (list) {
        items = list.getElementsByClassName("cloudAttachmentItem");
      }

      for (let attachment of event.detail) {
        // Remove the attachment from the message body.
        if (list) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].contentLocation == attachment.contentLocation) {
              items[i].remove();
            }
          }
        }

        // Now, remove the attachment from our internal list.
        let index = this.cloudAttachments.indexOf(attachment);
        if (index != -1) {
          this.cloudAttachments.splice(index, 1);
        }
      }

      this._updateAttachmentCount(mailDoc);

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
   * @param aDocument the document to remove the root node from.
   */
  _removeRoot(aDocument) {
    let header = aDocument.getElementById("cloudAttachmentListRoot");
    if (header) {
      header.remove();
    }
  },

  /**
   * Given some node, returns the textual HTML representation for the node
   * and its children.
   *
   * @param aDocument the document that the node is embedded in
   * @param aNode the node to get the textual representation from
   */
  _getHTMLRepresentation(aDocument, aNode) {
    let tmp = aDocument.createElement("p");
    tmp.appendChild(aNode);
    return tmp.innerHTML;
  },

  /**
   * Generates an appropriately styled link.
   *
   * @param aDocument the document to append the link to - doesn't actually
   *                  get appended, but is used to generate the anchor node.
   * @param aContent the textual content of the link
   * @param aHref the HREF attribute for the generated link
   */
  _generateLink(aDocument, aContent, aHref) {
    const LINK_COLOR = "#0F7EDB";
    let link = aDocument.createElement("a");
    link.href = aHref;
    link.textContent = aContent;
    link.style.cssText = "color: " + LINK_COLOR + " !important";
    return link;
  },

  _findInsertionPoint(aDocument) {
    let mailBody = aDocument.querySelector("body");
    let editor = GetCurrentEditor();
    let selection = editor.selection;

    let childNodes = mailBody.childNodes;
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
    let signature = mailBody.querySelector(".moz-signature");

    // Are we replying?
    let replyCitation = mailBody.querySelector(".moz-cite-prefix");
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
    let forwardBody = mailBody.querySelector(".moz-forward-container");
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
   * @param aDocument the document to search for the elements.
   * @param aIDs an array of id strings.
   */
  _resetNodeIDs(aDocument, aIDs) {
    for (let id of aIDs) {
      let node = aDocument.getElementById(id);
      if (node) {
        node.id = "";
      }
    }
  },

  /**
   * Insert the header for the cloud attachment list, which we'll use to
   * as an insertion point for the individual cloud attachments.
   *
   * @param aDocument the document to insert the header into.
   */
  _insertHeader(aDocument) {
    // If there already exists a cloudAttachmentListRoot,
    // cloudAttachmentListHeader or cloudAttachmentList in the document,
    // strip them of their IDs so that we don't conflict with them.
    this._resetNodeIDs(aDocument, [
      "cloudAttachmentListRoot",
      "cloudAttachmentListHeader",
      "cloudAttachmentList",
    ]);

    let brandBundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );
    let editor = GetCurrentEditor();
    let selection = editor.selection;
    let originalAnchor = selection.anchorNode;
    let originalOffset = selection.anchorOffset;

    // Save off the selection ranges so we can restore them later.
    let ranges = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i));
    }

    this._findInsertionPoint(aDocument);

    if (gMsgCompose.composeHTML) {
      // It's really quite strange, but if we don't set
      // the innerHTML of each element to be non-empty, then
      // the nodes fail to be added to the compose window.
      let root = editor.createElementWithDefaults("div");
      root.id = "cloudAttachmentListRoot";
      root.style.padding = "15px";
      root.style.backgroundColor = "#D9EDFF";
      root.innerHTML = " ";

      let header = editor.createElementWithDefaults("div");
      header.id = "cloudAttachmentListHeader";
      header.style.marginBottom = "15px";
      header.innerHTML = " ";
      root.appendChild(header);

      let list = editor.createElementWithDefaults("div");
      list.id = "cloudAttachmentList";
      list.style.backgroundColor = "#FFFFFF";
      list.style.padding = "15px";
      list.display = "inline-block";
      list.innerHTML = " ";
      root.appendChild(list);

      let footer = editor.createElementWithDefaults("div");
      let appLinkUrl = Services.prefs.getCharPref(
        "mail.cloud_files.inserted_urls.footer.link"
      );
      let appname = this._generateLink(
        aDocument,
        brandBundle.GetStringFromName("brandFullName"),
        appLinkUrl
      );

      let applink = this._getHTMLRepresentation(aDocument, appname);
      let footerMessage = getComposeBundle().getFormattedString(
        "cloudAttachmentListFooter",
        [applink],
        1
      );

      footer.innerHTML = footerMessage; // eslint-disable-line no-unsanitized/property
      footer.style.color = "#444444";
      footer.style.fontSize = "small";
      footer.style.marginTop = "15px";
      root.appendChild(footer);

      editor.insertElementAtSelection(root, false);
    } else {
      let root = editor.createElementWithDefaults("div");
      root.id = "cloudAttachmentListRoot";

      let header = editor.createElementWithDefaults("div");
      header.id = "cloudAttachmentListHeader";
      header.innerHTML = " ";
      root.appendChild(header);

      let list = editor.createElementWithDefaults("span");
      list.id = "cloudAttachmentList";
      root.appendChild(list);

      editor.insertElementAtSelection(root, false);
    }

    selection.collapse(originalAnchor, originalOffset);

    // Restore the selection ranges.
    for (let range of ranges) {
      selection.addRange(range);
    }
  },

  /**
   * Updates the count of how many attachments have been added
   * in HTML emails.
   *
   * @aDocument the document that contains the cloudAttachmentListHeader node.
   */
  _updateAttachmentCount(aDocument) {
    let header = aDocument.getElementById("cloudAttachmentListHeader");
    if (!header) {
      return;
    }

    let count = PluralForm.get(
      this.cloudAttachments.length,
      getComposeBundle().getString("cloudAttachmentCountHeader")
    );

    header.textContent = count.replace("#1", this.cloudAttachments.length);
  },

  /**
   * Insert the information for a cloud attachment.
   *
   * @param aDocument the document to insert the item into
   * @param aAttachment the nsIMsgAttachment to insert
   * @param aAccount the cloud storage account
   */
  _insertItem(aDocument, aAttachment, aAccount) {
    let list = aDocument.getElementById("cloudAttachmentList");

    if (!list) {
      this._insertHeader(aDocument);
      list = aDocument.getElementById("cloudAttachmentList");
    }

    let node = aDocument.createElement("div");
    node.className = "cloudAttachmentItem";
    node.contentLocation = aAttachment.contentLocation;

    let provider = cloudFileAccounts.getProviderForType(aAccount.type);

    if (gMsgCompose.composeHTML) {
      node.style.border = "1px solid #CDCDCD";
      node.style.borderRadius = "5px";
      node.style.marginTop = "10px";
      node.style.marginBottom = "10px";
      node.style.padding = "15px";

      let paperclip = aDocument.createElement("img");
      paperclip.style.marginRight = "5px";
      paperclip.style.cssFloat = "left";
      paperclip.style.width = "24px";
      paperclip.style.height = "24px";
      paperclip.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAABVUlEQVR42mNgGChgbGzMqm9slqFnbHZLz8TsPwoGioHkQGrItgBsOLrBaFjfxCydbAvgLjc2zQNymZCkmPRMzfOhllwj3wKoK9EMB4PQ0FBmJHmgWtM1eqZmS8m1gEHXxGyLnon5WlzyyGyyLMBmwKgFoxYMPgv+gdjq1ta8YL6elRhU/i+1LDgAYuuamidC+Q1geVOzzVSxQN/EPAnKvwLM0cFA+hOYb2TmRIkFH0CaDExNDbS1HXgwim1o2QMKNvIsMDafCtW4DOwLMzM1YJl0ChxUxqaNQCFGsDqgRRB1ppdIssDQ3FwLqPE7ermvY2ysDK8zEEH3RdfYWIPkIlvX1DQaasAvfVPTGBQ5E3MvoPhXiAPMYympFxoQ4W7eA/IBKIhASRRiuOkUiutnoGuzYQYi4b/AOCmjWiMAGFz2QEO3gwwGunoXiE+T1oa5uTkfKeoBW+cLhPF1+Q8AAAAASUVORK5CYII=";
      node.appendChild(paperclip);

      let link = this._generateLink(
        aDocument,
        aAttachment.name,
        aAttachment.contentLocation
      );
      link.setAttribute("moz-do-not-send", "true");
      node.appendChild(link);

      let size = aDocument.createElement("span");
      size.textContent =
        "(" + gMessenger.formatFileSize(aAttachment.size) + ")";
      size.style.marginLeft = "5px";
      size.style.fontSize = "small";
      size.style.color = "grey";
      node.appendChild(size);

      let providerIdentity = aDocument.createElement("span");
      providerIdentity.style.cssFloat = "right";

      if (provider.iconURL) {
        let providerIcon = aDocument.createElement("img");
        providerIcon.style.marginRight = "5px";
        providerIcon.style.maxWidth = "24px";
        providerIcon.style.maxHeight = "24px";
        providerIcon.style.verticalAlign = "middle";
        providerIdentity.appendChild(providerIcon);

        if (!/^(chrome|moz-extension):\/\//i.test(provider.iconURL)) {
          providerIcon.src = provider.iconURL;
        } else {
          try {
            // Let's use the goodness from MsgComposeCommands.js since we're
            // sitting right in a compose window.
            providerIcon.src = window.loadBlockedImage(provider.iconURL, true);
          } catch (e) {
            // Couldn't load the referenced image.
            Cu.reportError(e);
          }
        }
      }

      if (provider.serviceURL) {
        let providerLink = this._generateLink(
          aDocument,
          provider.displayName,
          provider.serviceURL
        );
        providerLink.style.verticalAlign = "middle";
        providerIdentity.appendChild(providerLink);
      } else {
        let providerName = aDocument.createElement("span");
        providerName.textContent = provider.displayName;
        providerName.style.verticalAlign = "middle";
        providerIdentity.appendChild(providerName);
      }

      node.appendChild(providerIdentity);

      let downloadUrl = this._generateLink(
        aDocument,
        aAttachment.contentLocation,
        aAttachment.contentLocation
      );
      downloadUrl.style.fontSize = "small";
      downloadUrl.style.display = "block";

      node.appendChild(downloadUrl);
    } else {
      node.textContent = getComposeBundle().getFormattedString(
        "cloudAttachmentListItem",
        [
          aAttachment.name,
          gMessenger.formatFileSize(aAttachment.size),
          provider.displayName,
          aAttachment.contentLocation,
        ]
      );
    }

    this._updateAttachmentCount(aDocument);
    list.appendChild(node);
  },

  /**
   * Event handler for when mail is sent.  For mail that is being sent
   * (and not saved!), find any cloudAttachmentList* nodes that we've created,
   * and strip their IDs out.  That way, if the receiving user replies by
   * sending some BigFiles, we don't run into ID conflicts.
   */
  send(aEvent) {
    let msgType = parseInt(aEvent.target.getAttribute("msgtype"));

    if (
      msgType == Ci.nsIMsgCompDeliverMode.Now ||
      msgType == Ci.nsIMsgCompDeliverMode.Later ||
      msgType == Ci.nsIMsgCompDeliverMode.Background
    ) {
      const kIDs = [
        "cloudAttachmentList",
        "cloudAttachmentListRoot",
        "cloudAttachmentListHeader",
      ];
      let mailDoc = document.getElementById("content-frame").contentDocument;

      for (let id of kIDs) {
        let element = mailDoc.getElementById(id);
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

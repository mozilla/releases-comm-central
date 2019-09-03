/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This content script should work in any browser or iframe and should not
 * depend on the frame being contained in tabbrowser. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.defineModuleGetter(this, "LoginManagerContent",
  "resource://gre/modules/LoginManagerContent.jsm");
ChromeUtils.defineModuleGetter(this, "InsecurePasswordUtils",
  "resource://gre/modules/InsecurePasswordUtils.jsm");
ChromeUtils.defineModuleGetter(this, "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm");
ChromeUtils.defineModuleGetter(this, "LoginFormFactory",
  "resource://gre/modules/LoginManagerContent.jsm");
ChromeUtils.defineModuleGetter(this, "PlacesUIUtils",
  "resource:///modules/PlacesUIUtils.jsm");
ChromeUtils.defineModuleGetter(this, "Feeds",
  "resource:///modules/Feeds.jsm");

addMessageListener("RemoteLogins:fillForm", message => {
  LoginManagerContent.receiveMessage(message, content);
});

addEventListener("DOMFormHasPassword", event => {
  LoginManagerContent.onDOMFormHasPassword(event, content);
  let formLike = LoginFormFactory.createFromForm(event.target);
  InsecurePasswordUtils.reportInsecurePasswords(formLike);
});

addEventListener("DOMInputPasswordAdded", event => {
  LoginManagerContent.onDOMInputPasswordAdded(event, content);
  let formLike = LoginFormFactory.createFromField(event.target);
  InsecurePasswordUtils.reportInsecurePasswords(formLike);
});

addEventListener("pageshow", event => {
  LoginManagerContent.onPageShow(event, content);
}, true);

addEventListener("DOMAutoComplete", event => {
  LoginManagerContent.onUsernameInput(event);
});

addEventListener("blur", event => {
  LoginManagerContent.onUsernameInput(event);
});

addMessageListener("Bookmarks:GetPageDetails", (message) => {
  let doc = content.document;
  let isErrorPage = /^about:(neterror|certerror|blocked)/.test(doc.documentURI);
  sendAsyncMessage("Bookmarks:GetPageDetails:Result",
                   { isErrorPage,
                     description: PlacesUIUtils.getDescriptionFromDocument(doc) });
});

const MathMLNS = "http://www.w3.org/1998/Math/MathML";
const XLinkNS  = "http://www.w3.org/1999/xlink";

let PageInfoListener = {

  init: function() {
    addMessageListener("PageInfo:getData", this);
  },

  receiveMessage: function(message) {
    this.imageViewRows = [];
    this.linkViewRows = [];
    this.formViewRows = [];
    let strings = message.data.strings;
    let window;
    let document;

    let frameOuterWindowID = message.data.frameOuterWindowID;

    // If inside frame then get the frame's window and document.
    if (frameOuterWindowID) {
      window = Services.wm.getOuterWindowWithId(frameOuterWindowID);
      document = window.document;
    }
    else {
      document = content.document;
      window = content.window;
    }

    let pageInfoData = {metaViewRows: this.getMetaInfo(document),
                        docInfo: this.getDocumentInfo(document),
                        feeds: this.getFeedsInfo(document, strings),
                        windowInfo: this.getWindowInfo(window)};
    sendAsyncMessage("PageInfo:data", pageInfoData);

    // Separate step so page info dialog isn't blank while waiting for this
    // to finish.
    this.getMediaInfo(document, window, strings);

    // Send the message after all the media elements have been walked through.
    let pageInfoMediaData = {imageViewRows: this.imageViewRows,
                             linkViewRows: this.linkViewRows,
                             formViewRows: this.formViewRows};

    this.imageViewRows = null;
    this.linkViewRows = null;
    this.formViewRows = null;

    sendAsyncMessage("PageInfo:mediaData", pageInfoMediaData);
  },

  getMetaInfo: function(document) {
    let metaViewRows = [];

    // Get the meta tags from the page.
    let metaNodes = document.getElementsByTagName("meta");

    for (let metaNode of metaNodes) {
      metaViewRows.push([metaNode.name || metaNode.httpEquiv ||
                         metaNode.getAttribute("property"),
                         metaNode.content]);
    }

    return metaViewRows;
  },

  getWindowInfo: function(window) {
    let windowInfo = {};
    windowInfo.isTopWindow = window == window.top;

    let hostName = null;
    try {
      hostName = window.location.host;
    }
    catch (exception) { }

    windowInfo.hostName = hostName;
    return windowInfo;
  },

  getDocumentInfo: function(document) {
    let docInfo = {};
    docInfo.title = document.title;
    docInfo.location = document.location.toString();
    docInfo.referrer = document.referrer;
    docInfo.compatMode = document.compatMode;
    docInfo.contentType = document.contentType;
    docInfo.characterSet = document.characterSet;
    docInfo.lastModified = document.lastModified;
    docInfo.principal = document.nodePrincipal;

    let documentURIObject = {};
    documentURIObject.spec = document.documentURIObject.spec;
    documentURIObject.originCharset = document.documentURIObject.originCharset;
    docInfo.documentURIObject = documentURIObject;

    docInfo.isContentWindowPrivate = PrivateBrowsingUtils.isContentWindowPrivate(content);

    return docInfo;
  },

  getFeedsInfo: function(document, strings) {
    let feeds = [];
    // Get the feeds from the page.
    let linkNodes = document.getElementsByTagName("link");
    let length = linkNodes.length;
    for (let i = 0; i < length; i++) {
      let link = linkNodes[i];
      if (!link.href) {
        continue;
      }
      let rel = link.rel && link.rel.toLowerCase();
      let rels = {};

      if (rel) {
        for (let relVal of rel.split(/\s+/)) {
          rels[relVal] = true;
        }
      }

      if (rels.feed || (link.type && rels.alternate && !rels.stylesheet)) {
        let type = Feeds.isValidFeed(link, document.nodePrincipal, "feed" in rels);
        if (type) {
          type = strings[type] || strings["application/rss+xml"];
          feeds.push([link.title, type, link.href]);
        }
      }
    }
    return feeds;
  },

  // Only called once to get the media tab's media elements from the content
  // page.
  getMediaInfo: function(document, window, strings)
  {
    let frameList = this.goThroughFrames(document, window);
    this.processFrames(document, frameList, strings);
  },

  goThroughFrames: function(document, window)
  {
    let frameList = [document];
    if (window && window.frames.length > 0) {
      let num = window.frames.length;
      for (let i = 0; i < num; i++) {
        // Recurse through the frames.
        frameList =
          frameList.concat(this.goThroughFrames(window.frames[i].document,
                                                window.frames[i]));
      }
    }
    return frameList;
  },

  processFrames: function(document, frameList, strings)
  {
    for (let doc of frameList) {
      let iterator = doc.createTreeWalker(doc, content.NodeFilter.SHOW_ELEMENT);

      while (iterator.nextNode()) {
        this.getMediaNode(document, strings, iterator.currentNode);
      }
    }
  },

  getMediaNode: function(document, strings, elem)
  {
    // Check for images defined in CSS (e.g. background, borders),
    // any node may have multiple.
    let computedStyle = elem.ownerDocument.defaultView.getComputedStyle(elem, "");

    let addImage = (url, type, alt, elem, isBg) => {
      let element = this.serializeElementInfo(document, url, type, alt, elem, isBg);
      this.imageViewRows.push([url, type, alt, element, isBg]);
    };

    if (computedStyle) {
      let addImgFunc = (label, val) => {
        if (val.primitiveType == content.CSSPrimitiveValue.CSS_URI) {
          addImage(val.getStringValue(), label, strings.notSet, elem, true);
        }
        else if (val.primitiveType == content.CSSPrimitiveValue.CSS_STRING) {
          // This is for -moz-image-rect.
          // TODO: Reimplement once bug 714757 is fixed.
          let strVal = val.getStringValue();
          if (strVal.search(/^.*url\(\"?/) > -1) {
            let url = strVal.replace(/^.*url\(\"?/,"").replace(/\"?\).*$/,"");
            addImage(url, label, strings.notSet, elem, true);
          }
        }
        else if (val.cssValueType == content.CSSValue.CSS_VALUE_LIST) {
          // Recursively resolve multiple nested CSS value lists.
          for (let i = 0; i < val.length; i++) {
            addImgFunc(label, val.item(i));
          }
        }
      };

      addImgFunc(strings.mediaBGImg, computedStyle.getPropertyCSSValue("background-image"));
      addImgFunc(strings.mediaBorderImg, computedStyle.getPropertyCSSValue("border-image-source"));
      addImgFunc(strings.mediaListImg, computedStyle.getPropertyCSSValue("list-style-image"));
      addImgFunc(strings.mediaCursor, computedStyle.getPropertyCSSValue("cursor"));
    }

    let addForm = (elem) => {
      let element = this.serializeFormInfo(document, elem, strings);
      this.formViewRows.push([elem.name, elem.method, elem.action, element]);
    };

    // One swi^H^H^Hif-else to rule them all.
    if (elem instanceof content.HTMLAnchorElement) {
      this.linkViewRows.push([this.getValueText(elem), elem.href,
                              strings.linkAnchor, elem.target, elem.accessKey]);
    }
    else if (elem instanceof content.HTMLImageElement) {
      addImage(elem.src, strings.mediaImg,
               (elem.hasAttribute("alt")) ? elem.alt : strings.notSet,
               elem, false);
    }
    else if (elem instanceof content.HTMLAreaElement) {
      this.linkViewRows.push([elem.alt, elem.href,
                              strings.linkArea, elem.target, ""]);
    }
    else if (elem instanceof content.HTMLVideoElement) {
      addImage(elem.currentSrc, strings.mediaVideo, "", elem, false);
    }
    else if (elem instanceof content.HTMLAudioElement) {
      addImage(elem.currentSrc, strings.mediaAudio, "", elem, false);
    }
    else if (elem instanceof content.HTMLLinkElement) {
      if (elem.rel) {
        let rel = elem.rel;
        if (/\bicon\b/i.test(rel)) {
          addImage(elem.href, strings.mediaLink, "", elem, false);
        }
        else if (/(?:^|\s)stylesheet(?:\s|$)/i.test(rel)) {
          this.linkViewRows.push([elem.rel, elem.href,
                                  strings.linkStylesheet, elem.target, ""]);
        }
        else {
          this.linkViewRows.push([elem.rel, elem.href,
                                  strings.linkRel, elem.target, ""]);
        }
      }
      else {
        this.linkViewRows.push([elem.rev, elem.href,
                                strings.linkRev, elem.target, ""]);
      }
    }
    else if (elem instanceof content.HTMLInputElement ||
             elem instanceof content.HTMLButtonElement) {
      switch (elem.type.toLowerCase()) {
        case "image":
          addImage(elem.src, strings.mediaInput,
                   (elem.hasAttribute("alt")) ? elem.alt : strings.notSet,
                   elem, false);
          // Fall through, <input type="image"> submits, too
        case "submit":
          if ("form" in elem && elem.form) {
            this.linkViewRows.push([elem.value || this.getValueText(elem) ||
                                    strings.linkSubmit, elem.form.action,
                                    strings.linkSubmission,
                                    elem.form.target, ""]);
          }
          else {
            this.linkViewRows.push([elem.value || this.getValueText(elem) ||
                                    strings.linkSubmit, "",
                                    strings.linkSubmission, "", ""]);
          }
      }
    }
    else if (elem instanceof content.HTMLFormElement) {
      addForm(elem);
    }
    else if (elem instanceof content.HTMLObjectElement) {
      addImage(elem.data, strings.mediaObject, this.getValueText(elem),
               elem, false);
    }
    else if (elem instanceof content.HTMLEmbedElement) {
      addImage(elem.src, strings.mediaEmbed, "", elem, false);
    }
    else if (elem.namespaceURI == MathMLNS && elem.hasAttribute("href")) {
      let href = elem.getAttribute("href");
      try {
        href = makeURLAbsolute(elem.baseURI, href,
                               elem.ownerDocument.characterSet);
      } catch (e) {}
      this.linkViewRows.push([this.getValueText(elem), href, strings.linkX,
                              "", ""]);
    }
    else if (elem.hasAttributeNS(XLinkNS, "href")) {
      let href = elem.getAttributeNS(XLinkNS, "href");
      try {
        href = makeURLAbsolute(elem.baseURI, href,
                               elem.ownerDocument.characterSet);
      } catch (e) {}
      // SVG images without an xlink:href attribute are ignored
      if (elem instanceof content.SVGImageElement) {
        addImage(href, strings.mediaImg, "", elem, false);
      }
      else {
        this.linkViewRows.push([this.getValueText(elem), href, strings.linkX,
                                "", ""]);
      }
    }
    else if (elem instanceof content.HTMLScriptElement) {
      this.linkViewRows.push([elem.type || elem.getAttribute("language") ||
                              strings.notSet,
                              elem.src || strings.linkScriptInline,
                              strings.linkScript, "", "", ""]);
    }
  },

  /**
   * Set up a JSON element object with all the instanceOf and other infomation
   * that makePreview in pageInfo.js uses to figure out how to display the
   * preview.
   */

  serializeElementInfo: function(document, url, type, alt, item, isBG)
  {
    let result = {};

    let imageText;
    if (!isBG &&
        !(item instanceof content.SVGImageElement) &&
        !(document instanceof content.ImageDocument)) {
      imageText = item.title || item.alt;

      if (!imageText && !(item instanceof content.HTMLImageElement)) {
        imageText = this.getValueText(item);
      }
    }

    result.imageText = imageText;
    result.longDesc = item.longDesc;
    result.numFrames = 1;

    if (item instanceof content.HTMLObjectElement ||
        item instanceof content.HTMLEmbedElement ||
        item instanceof content.HTMLLinkElement) {
      result.mimeType = item.type;
    }

    if (!result.mimeType && !isBG &&
        item instanceof Ci.nsIImageLoadingContent) {
      let imageRequest =
        item.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
      if (imageRequest) {
        result.mimeType = imageRequest.mimeType;
        let image = !(imageRequest.imageStatus & imageRequest.STATUS_ERROR) &&
                    imageRequest.image;
        if (image) {
          result.numFrames = image.numFrames;
        }
      }
    }

    // If we have a data url, get the MIME type from the url.
    if (!result.mimeType && url.startsWith("data:")) {
      let dataMimeType = /^data:(image\/[^;,]+)/i.exec(url);
      if (dataMimeType)
        result.mimeType = dataMimeType[1].toLowerCase();
    }

    result.HTMLLinkElement = item instanceof content.HTMLLinkElement;
    result.HTMLInputElement = item instanceof content.HTMLInputElement;
    result.HTMLImageElement = item instanceof content.HTMLImageElement;
    result.HTMLObjectElement = item instanceof content.HTMLObjectElement;
    result.HTMLEmbedElement = item instanceof content.HTMLEmbedElement;
    result.SVGImageElement = item instanceof content.SVGImageElement;
    result.HTMLVideoElement = item instanceof content.HTMLVideoElement;
    result.HTMLAudioElement = item instanceof content.HTMLAudioElement;

    if (isBG) {
      // Items that are showing this image as a background
      // image might not necessarily have a width or height,
      // so we'll dynamically generate an image and send up the
      // natural dimensions.
      let img = content.document.createElement("img");
      img.src = url;
      result.naturalWidth = img.naturalWidth;
      result.naturalHeight = img.naturalHeight;
    } else {
      // Otherwise, we can use the current width and height
      // of the image.
      result.width = item.width;
      result.height = item.height;
    }

    if (item instanceof content.SVGImageElement) {
      result.SVGImageElementWidth = item.width.baseVal.value;
      result.SVGImageElementHeight = item.height.baseVal.value;
    }

    result.baseURI = item.baseURI;

    return result;
  },

  serializeFormInfo: function(document, form, strings)
  {
    let result = {};

    if (form.name)
      result.name = form.name;

    result.encoding = form.encoding;
    result.target = form.target;
    result.formfields = [];

    function findFirstControl(node, document) {
      function FormControlFilter(node) {
        if (node instanceof content.HTMLInputElement ||
            node instanceof content.HTMLSelectElement ||
            node instanceof content.HTMLButtonElement ||
            node instanceof content.HTMLTextAreaElement ||
           node instanceof content.HTMLObjectElement)
          return content.NodeFilter.FILTER_ACCEPT;
        return content.NodeFilter.FILTER_SKIP;
      }

      if (node.hasAttribute("for")) {
        return document.getElementById(node.getAttribute("for"));
      }

      var iterator = document.createTreeWalker(node, content.NodeFilter.SHOW_ELEMENT, FormControlFilter, true);

      return iterator.nextNode();
    }

    var whatfor;
    var labels = [];
    for (let label of form.getElementsByTagName("label")) {
      var whatfor = findFirstControl(label, document);

      if (whatfor && (whatfor.form == form)) {
        labels.push({label: whatfor, labeltext: this.getValueText(label)});
      }
    }

    result.formfields = [];

    var val;
    for (let formfield of form.elements) {
      if (formfield instanceof content.HTMLButtonElement)
        val = this.getValueText(formfield);
      else
        val = (/^password$/i.test(formfield.type)) ? strings.formPassword : formfield.value;

      var fieldlabel = "";
      for (let labelfor of labels) {
        if (formfield == labelfor.label) {
          fieldlabel = labelfor.labeltext;
        }
      }
      result.formfields.push([fieldlabel, formfield.name, formfield.type, val]);
    }

    return result;
  },

  //******** Other Misc Stuff
  // Modified from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html
  // parse a node to extract the contents of the node
  getValueText: function(node)
  {

    let valueText = "";

    // Form input elements don't generally contain information that is useful
    // to our callers, so return nothing.
    if (node instanceof content.HTMLInputElement ||
        node instanceof content.HTMLSelectElement ||
        node instanceof content.HTMLTextAreaElement) {
      return valueText;
    }

    // Otherwise recurse for each child.
    let length = node.childNodes.length;

    for (let i = 0; i < length; i++) {
      let childNode = node.childNodes[i];
      let nodeType = childNode.nodeType;

      // Text nodes are where the goods are.
      if (nodeType == content.Node.TEXT_NODE) {
        valueText += " " + childNode.nodeValue;
      }
      // And elements can have more text inside them.
      else if (nodeType == content.Node.ELEMENT_NODE) {
        // Images are special, we want to capture the alt text as if the image
        // weren't there.
        if (childNode instanceof content.HTMLImageElement) {
          valueText += " " + this.getAltText(childNode);
        }
        else {
          valueText += " " + this.getValueText(childNode);
        }
      }
    }

    return this.stripWS(valueText);
  },

  // Copied from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html.
  // Traverse the tree in search of an img or area element and grab its alt tag.
  getAltText: function(node)
  {
    let altText = "";

    if (node.alt) {
      return node.alt;
    }
    let length = node.childNodes.length;
    for (let i = 0; i < length; i++) {
      if ((altText = this.getAltText(node.childNodes[i]) != undefined)) { // stupid js warning...
        return altText;
      }
    }
    return "";
  },

  // Copied from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html.
  // Strip leading and trailing whitespace, and replace multiple consecutive
  // whitespace characters with a single space.
  stripWS: function(text)
  {
    let middleRE = /\s+/g;
    let endRE = /(^\s+)|(\s+$)/g;

    text = text.replace(middleRE, " ");
    return text.replace(endRE, "");
  }
};
PageInfoListener.init();

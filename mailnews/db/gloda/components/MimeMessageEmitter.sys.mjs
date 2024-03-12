/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var kStateUnknown = 0;
var kStateInHeaders = 1;
var kStateInBody = 2;
var kStateInAttachment = 3;

/**
 * When the saneBodySize flag is active, limit body parts to at most this many
 *  bytes.  See |MsgHdrToMimeMessage| for more information on the flag.
 *
 * The choice of 20k was made on the very scientific basis of running a query
 *  against my indexed e-mail and finding the point where these things taper
 *  off.  I chose 20 because things had tapered off pretty firmly by 16, so
 *  20 gave it some space and it was also the end of a mini-plateau.
 */
var MAX_SANE_BODY_PART_SIZE = 20 * 1024;

/**
 * Custom nsIMimeEmitter to build a sub-optimal javascript representation of a
 *  MIME message.  The intent is that a better mechanism than is evolved to
 *  provide a javascript-accessible representation of the message.
 *
 * Processing occurs in two passes.  During the first pass, libmime is parsing
 *  the stream it is receiving, and generating header and body events for all
 *  MimeMessage instances it encounters.  This provides us with the knowledge
 *  of each nested message in addition to the top level message, their headers
 *  and sort-of their bodies.  The sort-of is that we may get more than
 *  would normally be displayed in cases involving multipart/alternatives.
 * We have augmented libmime to have a notify_nested_options parameter which
 *  is enabled when we are the consumer.  This option causes MimeMultipart to
 *  always emit a content-type header (via addHeaderField), defaulting to
 *  text/plain when an explicit value is not present.  Additionally,
 *  addHeaderField is called with a custom "x-jsemitter-part-path" header with
 *  the value being the part path (ex: 1.2.2).  Having the part path greatly
 *  simplifies our life for building the part hierarchy.
 * During the second pass, the libmime object model is traversed, generating
 *  attachment notifications for all leaf nodes.  From our perspective, this
 *  means file attachments and embedded messages (message/rfc822).  We use this
 *  pass to create the attachment objects proper, which we then substitute into
 *  the part tree we have already built.
 */
export function MimeMessageEmitter() {
  this._mimeMsg = ChromeUtils.importESModule(
    "resource:///modules/gloda/MimeMessage.sys.mjs"
  );
  this._utils = ChromeUtils.importESModule(
    "resource:///modules/gloda/GlodaUtils.sys.mjs"
  );

  this._url = null;
  this._partRE = this._utils.GlodaUtils.PART_RE;

  this._outputListener = null;

  this._curPart = null;
  this._curAttachment = null;
  this._partMap = {};
  this._bogusPartTranslation = {};

  this._state = kStateUnknown;

  this._writeBody = false;
}

var deathToNewlines = /\n/g;

MimeMessageEmitter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMimeEmitter"]),

  initialize(aUrl, aChannel, aFormat) {
    this._url = aUrl;
    this._curPart = new this._mimeMsg.MimeMessage();
    // the partName is intentionally ""!  not a place-holder!
    this._curPart.partName = "";
    this._curAttachment = "";
    this._partMap[""] = this._curPart;

    // pull options across...
    const options = this._mimeMsg.MsgHdrToMimeMessage.OPTION_TUNNEL;
    this._saneBodySize =
      options && "saneBodySize" in options ? options.saneBodySize : false;

    this._mimeMsg.MsgHdrToMimeMessage.RESULT_RENDEVOUZ[aUrl.spec] =
      this._curPart;
  },

  complete() {
    this._url = null;

    this._outputListener = null;

    this._curPart = null;
    this._curAttachment = null;
    this._partMap = null;
    this._bogusPartTranslation = null;
  },

  setPipe(aInputStream, aOutputStream) {
    // we do not care about these
  },
  set outputListener(aListener) {
    this._outputListener = aListener;
  },
  get outputListener() {
    return this._outputListener;
  },

  _stripParams(aValue) {
    const indexSemi = aValue.indexOf(";");
    if (indexSemi >= 0) {
      aValue = aValue.substring(0, indexSemi);
    }
    return aValue;
  },

  _beginPayload(aContentType) {
    const contentTypeNoParams = this._stripParams(aContentType).toLowerCase();
    if (
      contentTypeNoParams == "text/plain" ||
      contentTypeNoParams == "text/html" ||
      contentTypeNoParams == "text/enriched"
    ) {
      this._curPart = new this._mimeMsg.MimeBody(contentTypeNoParams);
      this._writeBody = true;
    } else if (contentTypeNoParams == "message/rfc822") {
      // startHeader will take care of this
      this._curPart = new this._mimeMsg.MimeMessage();
      // do not fall through into the content-type setting case; this
      //  content-type needs to get clobbered by the actual content-type of
      //  the enclosed message.
      this._writeBody = false;
      return;
    } else if (contentTypeNoParams.startsWith("multipart/")) {
      // this is going to fall-down with TNEF encapsulation and such, we really
      // need to just be consuming the object model.
      this._curPart = new this._mimeMsg.MimeContainer(contentTypeNoParams);
      this._writeBody = false;
    } else {
      this._curPart = new this._mimeMsg.MimeUnknown(contentTypeNoParams);
      this._writeBody = false;
    }
    // put the full content-type in the headers and normalize out any newlines
    this._curPart.headers["content-type"] = [
      aContentType.replace(deathToNewlines, ""),
    ];
  },

  // ----- Header Routines
  /**
   * StartHeader provides the base case for our processing.  It is the first
   *  notification we receive when processing begins on the outer rfc822
   *  message.  We do not receive an x-jsemitter-part-path notification for the
   *  message, but the aIsRootMailHeader tells us everything we need to know.
   *  (Or it would if we hadn't already set everything up in initialize.)
   *
   * When dealing with nested RFC822 messages, we will receive the
   *  addHeaderFields for the content-type and the x-jsemitter-part-path
   *  prior to the startHeader call.  This is because the MIME multipart
   *  container that holds the message is the one generating the notification.
   *  For that reason, we do not process them here, but instead in
   *  addHeaderField and _beginPayload.
   *
   * We do need to track our state for addHeaderField's benefit though.
   */
  startHeader(aIsRootMailHeader, aIsHeaderOnly, aMsgID, aOutputCharset) {
    this._state = kStateInHeaders;
  },
  /**
   * Receives a header field name and value for the current MIME part, which
   *  can be an rfc822/message or one of its sub-parts.
   *
   * The emitter architecture treats rfc822/messages as special because it was
   *  architected around presentation.  In that case, the organizing concept
   *  is the single top-level rfc822/message.  (It did not 'look into' nested
   *  messages in most cases.)
   * As a result the interface is biased towards being 'in the headers' or
   *  'in the body', corresponding to calls to startHeader and startBody,
   *  respectively.
   * This information is interesting to us because the message itself is an
   *  odd pseudo-mime-part.  Because it has only one child, its headers are,
   *  in a way, its payload, but they also serve as the description of its
   *  MIME child part.  This introduces a complication in that we see the
   *  content-type for the message's "body" part before we actually see any
   *  of the headers.  To deal with this, we punt on the construction of the
   *  body part to the call to startBody() and predicate our logic on the
   *  _state field.
   */
  addHeaderField(aField, aValue) {
    if (this._state == kStateInBody) {
      aField = aField.toLowerCase();
      if (aField == "content-type") {
        this._beginPayload(aValue, true);
      } else if (aField == "x-jsemitter-part-path") {
        // This is either naming the current part, or referring to an already
        //  existing part (in the case of multipart/related on its second pass).
        // As such, check if the name already exists in our part map.
        const partName = this._stripParams(aValue);
        // if it does, then make the already-existing part at that path current
        if (partName in this._partMap) {
          this._curPart = this._partMap[partName];
          this._writeBody = "body" in this._curPart;
        } else {
          // otherwise, name the part we are holding onto and place it.
          this._curPart.partName = partName;
          this._placePart(this._curPart);
        }
      } else if (aField == "x-jsemitter-encrypted" && aValue == "1") {
        this._curPart.isEncrypted = true;
      }
      // There is no other field to be emitted in the body case other than the
      //  ones we just handled.  (They were explicitly added for the js
      //  emitter.)
    } else if (this._state == kStateInHeaders) {
      const lowerField = aField.toLowerCase();
      if (lowerField in this._curPart.headers) {
        this._curPart.headers[lowerField].push(aValue);
      } else {
        this._curPart.headers[lowerField] = [aValue];
      }
    }
  },
  addAllHeaders(aAllHeaders, aHeaderSize) {
    // This is called by the parsing code after the calls to AddHeaderField (or
    //  AddAttachmentField if the part is an attachment), and seems to serve
    //  a specialized, quasi-redundant purpose.  (nsMimeBaseEmitter creates a
    //  nsIMimeHeaders instance and hands it to the nsIMsgMailNewsUrl.)
    // nop
  },
  writeHTMLHeaders(aName) {
    // It doesn't look like this should even be part of the interface; I think
    //  only the nsMimeHtmlDisplayEmitter::EndHeader call calls this signature.
    // nop
  },
  endHeader(aName) {},
  updateCharacterSet(aCharset) {
    // we do not need to worry about this.  it turns out this notification is
    //  exclusively for the benefit of the UI.  libmime, believe it or not,
    //  is actually doing the right thing under the hood and handles all the
    //  encoding issues for us.
    // so, get ready for the only time you will ever hear this:
    //  three cheers for libmime!
  },

  /**
   * Place a part in its proper location; requires the parent to be present.
   * However, we no longer require in-order addition of children.  (This is
   *  currently a hedge against extension code doing wacky things.  Our
   *  motivating use-case is multipart/related which actually does generate
   *  everything in order on its first pass, but has a wacky second pass. It
   *  does not actually trigger the out-of-order code because we have
   *  augmented the libmime code to generate its x-jsemitter-part-path info
   *  a second time, in which case we reuse the part we already created.)
   *
   * @param {MimeMessage} aPart - Part to place.
   */
  _placePart(aPart) {
    const partName = aPart.partName;
    this._partMap[partName] = aPart;

    const [storagePartName, , parentPart] = this._findOrCreateParent(partName);
    const lastDotIndex = storagePartName.lastIndexOf(".");
    if (parentPart !== undefined) {
      const indexInParent =
        parseInt(storagePartName.substring(lastDotIndex + 1)) - 1;
      // handle out-of-order notification...
      if (indexInParent < parentPart.parts.length) {
        parentPart.parts[indexInParent] = aPart;
      } else {
        while (indexInParent > parentPart.parts.length) {
          parentPart.parts.push(null);
        }
        parentPart.parts.push(aPart);
      }
    }
  },

  /**
   * In case the MIME structure is wrong, (i.e. we have no parent to add the
   *  current part to), this function recursively makes sure we create the
   *  missing bits in the hierarchy.
   * What happens in the case of encrypted emails (mimecryp.cpp):
   *  1. is the message
   *  1.1 doesn't exist
   *  1.1.1 is the multipart/alternative that holds the text/plain and text/html
   *  1.1.1.1 is text/plain
   *  1.1.1.2 is text/html
   * This function fills the missing bits.
   */
  _findOrCreateParent(aPartName) {
    const partName = aPartName + "";
    const parentName = partName.substring(0, partName.lastIndexOf("."));
    let parentPart;
    if (parentName in this._partMap) {
      parentPart = this._partMap[parentName];
      const lastDotIndex = partName.lastIndexOf(".");
      const indexInParent = parseInt(partName.substring(lastDotIndex + 1)) - 1;
      if (
        "parts" in parentPart &&
        indexInParent == parentPart.parts.length - 1
      ) {
        return [partName, parentName, parentPart];
      }
      return this._findAnotherContainer(aPartName);
    }

    // Find the grandparent
    const [, , grandParentPart] = this._findOrCreateParent(parentName);
    // Create the missing part.
    parentPart = new this._mimeMsg.MimeContainer("multipart/fake-container");
    // Add it to the grandparent, remember we added it in the hierarchy.
    grandParentPart.parts.push(parentPart);
    this._partMap[parentName] = parentPart;
    return [partName, parentName, parentPart];
  },

  /**
   * In the case of UUEncoded attachments, libmime tells us about the attachment
   *  as a child of a MimeBody. This obviously doesn't make us happy, so in case
   *  libmime wants us to attach an attachment to something that's not a
   *  container, we walk up the mime tree to find a suitable container to hold
   *  the attachment.
   * The results are cached so that they're consistent across calls — this
   *  ensures the call to _replacePart works fine.
   */
  _findAnotherContainer(aPartName) {
    if (aPartName in this._bogusPartTranslation) {
      return this._bogusPartTranslation[aPartName];
    }

    let parentName = aPartName + "";
    let parentPart;
    while (!(parentPart && "parts" in parentPart) && parentName.length) {
      parentName = parentName.substring(0, parentName.lastIndexOf("."));
      parentPart = this._partMap[parentName];
    }
    const childIndex = parentPart.parts.length;
    const fallbackPartName =
      (parentName ? parentName + "." : "") + (childIndex + 1);
    return (this._bogusPartTranslation[aPartName] = [
      fallbackPartName,
      parentName,
      parentPart,
    ]);
  },

  /**
   * In the case of attachments, we need to replace an existing part with a
   *  more representative part...
   *
   * @param {MimeMessage} aPart - Part to place.
   */
  _replacePart(aPart) {
    // _partMap always maps the libmime names to parts
    const partName = aPart.partName;
    this._partMap[partName] = aPart;

    const [storagePartName, , parentPart] = this._findOrCreateParent(partName);

    const childNamePart = storagePartName.substring(
      storagePartName.lastIndexOf(".") + 1
    );
    const childIndex = parseInt(childNamePart) - 1;

    // The attachment has been encapsulated properly in a MIME part (most of
    // the cases). This does not hold for UUencoded-parts for instance (see
    // test_mime_attachments_size.js for instance).
    if (childIndex < parentPart.parts.length) {
      const oldPart = parentPart.parts[childIndex];
      parentPart.parts[childIndex] = aPart;
      // copy over information from the original part
      aPart.parts = oldPart.parts;
      aPart.headers = oldPart.headers;
      aPart.isEncrypted = oldPart.isEncrypted;
    } else {
      parentPart.parts[childIndex] = aPart;
    }
  },

  // ----- Attachment Routines
  // The attachment processing happens after the initial streaming phase (during
  //  which time we receive the messages, both bodies and headers).  Our caller
  //  traverses the libmime child object hierarchy, emitting an attachment for
  //  each leaf object or sub-message.
  startAttachment(aName, aContentType, aUrl, aIsExternalAttachment) {
    this._state = kStateInAttachment;

    // we need to strip our magic flags from the URL; this regexp matches all
    // the specific flags that the jsmimeemitter understands (we abuse the URL
    // parameters to pass information all the way to here)
    aUrl = aUrl.replace(
      /((header=filter|emitter=js|examineEncryptedParts=(true|false)))&?/g,
      ""
    );
    // the url should contain a part= piece that tells us the part name, which
    // we then use to figure out where to place that part if it's a real
    // attachment.
    let partMatch, partName;
    if (aUrl.startsWith("http") || aUrl.startsWith("file")) {
      // if we have a remote url, unlike non external mail part urls, it may also
      // contain query strings starting with ?; PART_RE does not handle this.
      partMatch = aUrl.match(/[?&]part=[^&]+$/);
      partMatch = partMatch && partMatch[0];
      partName = partMatch && partMatch.split("part=")[1];
    } else {
      partMatch = this._partRE.exec(aUrl);
      partName = partMatch && partMatch[1];
    }
    this._curAttachment = partName;

    if (aContentType == "message/rfc822") {
      // we want to offer extension authors a way to see attachments as the
      // message readers sees them, which means attaching an extra url property
      // to the part that was already created before
      if (partName) {
        // we disguise this MimeMessage into something that can be used as a
        // MimeAttachment so that it is transparent for the user code
        this._partMap[partName].url = aUrl;
        this._partMap[partName].isExternal = aIsExternalAttachment;
        this._partMap[partName].name = aName;
      }
    } else if (partName) {
      const part = new this._mimeMsg.MimeMessageAttachment(
        partName,
        aName,
        aContentType,
        aUrl,
        aIsExternalAttachment
      );
      // replace the existing part with the attachment...
      this._replacePart(part);
    }
  },
  addAttachmentField(aField, aValue) {
    // What gets passed in here is X-Mozilla-PartURL with a value that
    //  is completely identical to aUrl from the call to startAttachment.
    //  (it's the same variable they use in each case).  As such, there is
    //  no reason to handle that here.
    // However, we also pass information about the size of the attachment, and
    //  that we want to handle
    if (
      aField == "X-Mozilla-PartSize" &&
      this._curAttachment in this._partMap
    ) {
      this._partMap[this._curAttachment].size = parseInt(aValue);
    }
  },
  endAttachment() {
    // don't need to do anything here, since we don't care about the headers.
  },
  endAllAttachments() {
    // nop
  },

  // ----- Body Routines
  /**
   * We don't get an x-jsemitter-part-path for the message body, and we ignored
   *  our body part's content-type in addHeaderField, so this serves as our
   *  notice to set up the part (giving it a name).
   */
  startBody(aIsBodyOnly, aMsgID, aOutCharset) {
    this._state = kStateInBody;

    const subPartName =
      this._curPart.partName == "" ? "1" : this._curPart.partName + ".1";
    this._beginPayload(this._curPart.get("content-type", "text/plain"));
    this._curPart.partName = subPartName;
    this._placePart(this._curPart);
  },

  /**
   * Write to the body.  When saneBodySize is active, we stop adding if we are
   *  already at the limit for this body part.
   */
  writeBody(aBuf, aSize, aOutAmountWritten) {
    if (
      this._writeBody &&
      (!this._saneBodySize || this._curPart.size < MAX_SANE_BODY_PART_SIZE)
    ) {
      this._curPart.appendBody(aBuf);
    }
  },

  endBody() {},

  // ----- Generic Write (confusing)
  // (binary data writing...)
  write(aBuf, aSize, aOutAmountWritten) {
    // we don't actually ever get called because we don't have the attachment
    //  binary payloads pass through us, but we do the following just in case
    //  we did get called (otherwise the caller gets mad and throws exceptions).
    aOutAmountWritten.value = aSize;
  },

  // (string writing)
  utilityWrite(aBuf) {
    this.write(aBuf, aBuf.length, {});
  },
};

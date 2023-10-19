/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @see {nsIMailChannel}
 */
export class MailChannel {
  _headerNames = [];
  _headerValues = [];
  _attachments = [];
  _mailCharacterSet = null;
  _progressListener = null;

  addHeaderFromMIME(name, value) {
    this._headerNames.push(name);
    this._headerValues.push(value);
  }

  get headerNames() {
    return this._headerNames;
  }

  get headerValues() {
    return this._headerValues;
  }

  handleAttachmentFromMIME(contentType, url, displayName, uri, notDownloaded) {
    const attachment = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
      Ci.nsIWritablePropertyBag2
    );
    attachment.setPropertyAsAUTF8String("contentType", contentType);
    attachment.setPropertyAsAUTF8String("url", url);
    attachment.setPropertyAsAUTF8String("displayName", displayName);
    attachment.setPropertyAsAUTF8String("uri", uri);
    attachment.setPropertyAsBool("notDownloaded", notDownloaded);
    this._attachments.push(attachment);
  }

  addAttachmentFieldFromMIME(field, value) {
    const attachment = this._attachments[this._attachments.length - 1];
    attachment.setPropertyAsAUTF8String(field, value);
  }

  get attachments() {
    return this._attachments.slice();
  }

  get mailCharacterSet() {
    return this._mailCharacterSet;
  }

  set mailCharacterSet(value) {
    const ccm = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    this._mailCharacterSet = ccm.getCharsetAlias(value);
  }

  imipMethod = null;
  imipItem = null;
  smimeHeaderSink = null;

  get listener() {
    return this._progressListener?.get();
  }

  set listener(listener) {
    this._progressListener = Cu.getWeakReference(listener);
  }
}

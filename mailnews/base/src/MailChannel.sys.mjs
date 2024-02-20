/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A class that email-streaming channels can use to provide access to
 * parsed message headers, message attachment info, and other metadata.
 * The intended use is by QIing nsIChannel to nsIMailChannel.
 *
 * @implements {nsIMailChannel}
 */
export class MailChannel {
  _headerNames = [];
  _headerValues = [];
  _attachments = [];
  _mailCharacterSet = null;
  _progressListener = null;

  /**
   * Called by MIME emitters to add a header to this mail channel.
   * Do not call otherwise.
   *
   * @param {string} name
   * @param {string} value
   */
  addHeaderFromMIME(name, value) {
    this._headerNames.push(name);
    this._headerValues.push(value);
  }

  /**
   * Header names for this request, available at onStopRequest.
   * The number of header names is the same as the number of header values,
   * and they are in the same order.
   *
   * @returns {string[]}
   */
  get headerNames() {
    return this._headerNames;
  }

  /**
   * Header values for this request, available at onStopRequest.
   *
   * @returns {string[]}
   */
  get headerValues() {
    return this._headerValues;
  }

  /**
   * Called by MIME emitters to add attachment info to this mail channel.
   * Do not call otherwise.
   *
   * @param {string} contentType
   * @param {string} url
   * @param {string} displayName
   * @param {string} uri
   * @param {boolean} notDownloaded
   */
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

  /**
   * Called by MIME emitters to add attachment info to this mail channel.
   * Do not call otherwise.
   *
   * @param {string} field
   * @param {string} value
   */
  addAttachmentFieldFromMIME(field, value) {
    const attachment = this._attachments[this._attachments.length - 1];
    attachment.setPropertyAsAUTF8String(field, value);
  }

  /**
   * Attachments for this request, available at onStopRequest.
   *
   * @returns {nsIPropertyBag2[]}
   */
  get attachments() {
    return this._attachments.slice();
  }

  /**
   * The character set of the message, according to the MIME parser. Not the
   * character set of the channel, which should always be UTF-8.
   *
   * @returns {string}
   */
  get mailCharacterSet() {
    return this._mailCharacterSet;
  }

  /** @param {string} value */
  set mailCharacterSet(value) {
    const ccm = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    this._mailCharacterSet = ccm.getCharsetAlias(value);
  }

  /**
   * The method property of iMIP attachments, as determined by the MIME parser.
   * Not to be set after onStopRequest.
   *
   * @type {string}
   */
  imipMethod = null;

  /**
   * The actual iMIP invitation, as created by CalMIMEConverter.
   * Not to be set after onStopRequest.
   *
   * @type {calIItipItem}
   */
  imipItem = null;

  /**
   * Set this in onStartRequest. Allows reactions based on OpenPGP
   * status changes.
   *
   * @type {nsIMsgOpenPGPSink}
   */
  openpgpSink = null;

  /**
   * Set this in onStartRequest. Allows reactions based on S/MIME
   * status changes.
   *
   * @type {nsIMsgSMIMESink}
   */
  smimeSink = null;

  /**
   * A listener for progress events. This object must also implement
   * {nsISupportsWeakReference}.
   *
   * @returns {?nsIMailProgressListener}
   */
  get listener() {
    return this._progressListener?.get();
  }

  /** @param {nsIMailProgressListener} listener */
  set listener(listener) {
    this._progressListener = Cu.getWeakReference(listener);
  }
}

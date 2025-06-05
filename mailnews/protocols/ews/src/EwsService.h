/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSSERVICE_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSSERVICE_H_

#include "nsIMsgMessageService.h"

class EwsService : public nsIMsgMessageService,
                   public nsIMsgMessageFetchPartService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGMESSAGESERVICE
  NS_DECL_NSIMSGMESSAGEFETCHPARTSERVICE

  EwsService();

 protected:
  virtual ~EwsService();

 private:
  /**
   * Retrieves the message at the given URI, downloading it first if requested,
   * then optionally converting it to the desired output format.
   *
   * When fetching a part of a message (e.g. to save an attachment), the URI's
   * query is expected to describe which part to isolate and what the output
   * format should be. This query is processed by the stream converter, and thus
   * will be ignored unless `aConvert` is true.
   */
  nsresult FetchMessage(nsIURI* uri, nsIStreamListener* streamListener);

  /**
   * Extracts the message key as a string from a message URI. Message URIs
   * are expected in the form:
   * ews-message://{user}@{server}/{Path/To/Folder}#{MessageKey}
   */
  nsresult MsgKeyStringFromMessageURI(nsIURI* uri, nsACString& msgKey);

  /**
   * Extracts the message key as a string from a URI used by an EWS message
   * channel. Such URIs are expected in the form:
   * x-moz-ews://{user}@{server}/{Path/To/Folder}/{MessageKey}
   *
   * This method also returns the URI path to the folder, i.e. the path from the
   * original URI without the message key.
   */
  nsresult MsgKeyStringFromChannelURI(nsIURI* uri, nsACString& msgKey,
                                      nsACString& folderURIPath);

  // Retrieves the message header matching the provided URI.
  //
  // The URI is expected to be either a message URI or one used by an EWS
  // message channel, see the documentation for `MsgKeyStringFromMessageURI` and
  // `MsgKeyStringFromChannelURI` respectively for the expected form of each
  // supported URI.
  nsresult MsgHdrFromUri(nsIURI* uri, nsIMsgDBHdr** _retval);

  // Retrieves the content of the message referenced by the provided message
  // URI. If the message content does not already exist in the offline store, it
  // is downloaded, stored, and then served.
  //
  // If `displayDocShell` is not null, then it is used to render the message.
  // Otherwise, if `streamListener` is not null, the message content is streamed
  // to it.
  nsresult GetMessageContent(const nsACString& messageURI,
                             nsIDocShell* displayDocShell,
                             nsIStreamListener* streamListener);

  // Downloads the content of the message referenced by the given message URI.
  // Once the message content has been downloaded, it is stored to the relevant
  // offline store, and passed onto the provided docshell or stream listener
  // similarly to `GetMessageContent`.
  nsresult DownloadMessage(nsIURI* messageURI, nsIMsgDBHdr* hdr,
                           nsIDocShell* displayDocShell,
                           nsIStreamListener* streamListener);
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSSERVICE_H_

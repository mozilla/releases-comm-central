/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGECHANNEL_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGECHANNEL_H_

#include "nsHashPropertyBag.h"
#include "nsIChannel.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgHdr.h"
#include "nsMailChannel.h"

class MessageFetchListener;

/**
 * A channel for streaming an EWS message out of the relevant message store.
 *
 * The message URI is expected to use the form:
 * x-moz-ews://{user}@{server}/{Path/To/Folder}/{MessageKey}
 *
 * Note that no specific encoding is applied to the folder path (besides the
 * standard URL path encoding).
 *
 * Translating this URI into a message header (which we can use to stream the
 * message's content from the message store) is done through calling
 * `EwsService::MessageURIToMsgHdr`.
 *
 * Design considerations on the form of "x-moz-ews" URIs: it includes the
 * message key in the path to follow RESTful semantics. The message is the
 * resource the URI is pointing to, "located" to the path preceding its key
 * (i.e. the path to the folder). Some alternatives that were considered are:
 *  * Setting the key as a query parameter, however we seem to use query
 *    parameters to control how the message is fetched and/or rendered/streamed,
 *    not which message the operation is about, so it would be inconsistent with
 *    the rest of the code.
 *  * Following the lead of `[protocol]-message` URIs, with the message key
 *    located in the "ref" part of the URI. However, this does not work well for
 *    displaying messages, as the DocShell does not take this part of the URI
 *    into account to decide whether it matches with a document that's already
 *    currently rendered (so it doesn't need to render it again); this would
 *    lead to every message in a folder being considered the same document.
 */
class EwsMessageChannel : public nsMailChannel,
                          public nsIChannel,
                          public nsHashPropertyBag {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  NS_DECL_NSIREQUEST
  NS_DECL_NSICHANNEL

  explicit EwsMessageChannel(nsIURI* uri, bool convert);

  friend class MessageFetchListener;

 protected:
  virtual ~EwsMessageChannel();

 private:
  /**
   * Starts asynchronously reading the message from the offline store.
   */
  nsresult StartMessageReadFromStore();

  /**
   * Fetches the message's content from the server, stores it in the relevant
   * message store, then feeds it to the consumer.
   */
  nsresult FetchAndReadMessage();

  // The stream listener to use to stream the message's content to the consumer.
  nsCOMPtr<nsIStreamListener> mStreamListener;
  bool mConvert;

  // The URI for the message which content we want to stream.
  nsCOMPtr<nsIURI> mURI;

  // The database entry for the message which content we want to stream.
  nsCOMPtr<nsIMsgDBHdr> mHdr;

  // The `nsIRequest` representing the operation of reading the message from the
  // offline store.
  //
  // It's instantiated by `StartMessageReadFromStore()` after the download has
  // finished, or on the channel open if the message already exists in the local
  // store.
  //
  // Once it's instantiated, most calls to `nsIRequest` methods received by
  // `EwsMessageChannel` are forwarded to `mReadRequest`.
  nsCOMPtr<nsIRequest> mReadRequest;

  // These attributes mostly exist to allow a basic implementation of most
  // `nsIChannel` methods. The content type (`mContentType`) will default to
  // "message/rfc822", the content disposition to inline, and the content length
  // to -1 (i.e. unknown).
  //
  // `mContentType` has a 255 characters buffer, since that's the maximum length
  // according to RFC4288, and, if streaming a specific attachment, the stream
  // converter will use the content type of the attachment as declared in the
  // RFC822 message (which means we cannot assume it will always fit within a
  // small set of expected content types).
  nsAutoCStringN<255> mContentType;
  nsAutoCString mCharset;
  uint32_t mContentDisposition;
  int64_t mContentLength;
  RefPtr<nsILoadGroup> mLoadGroup;
  nsLoadFlags mLoadFlags;
  nsCOMPtr<nsIInterfaceRequestor> mNotificationCallbacks;
  nsCOMPtr<nsISupports> mOwner;
  nsCOMPtr<nsILoadInfo> mLoadInfo;
  bool mPending;
  nsresult mStatus;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGECHANNEL_H_

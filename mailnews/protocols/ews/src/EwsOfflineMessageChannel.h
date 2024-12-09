/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_CHANNEL_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_CHANNEL_H

#include "nsIChannel.h"
#include "nsIInputStreamPump.h"
#include "nsMailChannel.h"

/**
 * A channel for streaming an EWS message out of the relevant message store.
 *
 * The message URI is expected either of these two forms:
 *    * ews-message://{user}@{server}/{Path/To/Folder}#{MessageKey}
 *    * x-moz-ews://{user}@{server}/{Path/To/Folder}/{MessageKey}
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
 * (i.e. the path to the folder). An alternative form could have been setting
 * the key as a query parameter, however we seem to use query parameters to
 * control how the message is fetched and/or rendered/streamed, not which
 * message the operation is about, so it would be inconsistent with the rest of
 * the code.
 */
class EwsOfflineMessageChannel : public nsMailChannel, public nsIChannel {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUEST
  NS_DECL_NSICHANNEL

  explicit EwsOfflineMessageChannel(nsIURI* uri);

 protected:
  virtual ~EwsOfflineMessageChannel();

 private:
  // The URI for the message which content we want to stream.
  nsCOMPtr<nsIURI> mURI;

  // The pump we're using to stream the message content. `nsIInputStreamPump`
  // inherits from `nsIRequest`, so we use it to handle some methods (such as
  // `Cancel`, `Suspend`, `GetStatus`, etc) we need to implement as part of
  // implementing the latter interface.
  nsCOMPtr<nsIInputStreamPump> mPump;

  // These attributes mostly exist to allow a basic implementation of most
  // `nsIChannel` methods. The content type (`mContentType`) will default to
  // "message/rfc822" and the content charset (`mCharset`) to "UTF-8".
  nsCString mContentType;
  nsCString mCharset;
  RefPtr<nsILoadGroup> mLoadGroup;
  nsLoadFlags mLoadFlags;
  nsCOMPtr<nsIInterfaceRequestor> mNotificationCallbacks;
  nsCOMPtr<nsISupports> mOwner;
  nsCOMPtr<nsILoadInfo> mLoadInfo;
};

#endif

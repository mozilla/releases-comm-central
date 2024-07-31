/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_CHANNEL_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_CHANNEL_H

#include "nsIChannel.h"
#include "nsMailChannel.h"

// A channel for loading email messages from Exchange Web Services.
//
// URIs are expected to be of the form `{scheme}://{host_string}/{message_id}`,
// where `host_string` matches the host string of the associated account and
// `message_id` is the EWS identifier for the requested message.
//
// If `text/html` is the requested content type, the channel will return the
// message as a rendered HTML document. Otherwise, it will return the message in
// its raw Internet Message Format form.
class EwsMessageChannel : public nsMailChannel, public nsIChannel {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUEST
  NS_DECL_NSICHANNEL

  // Constructs a new message channel.
  //
  // If `shouldConvert` is `true`, the content type of the channel will be set
  // to `text/html` and the channel will return a rendered HTML document fit for
  // display.
  explicit EwsMessageChannel(nsIURI* uri, bool shouldConvert = true);

 protected:
  virtual ~EwsMessageChannel();

 private:
  bool m_isPending;
  RefPtr<nsILoadGroup> m_loadGroup;
  nsresult m_status;
  nsLoadFlags m_loadFlags;
  RefPtr<nsIInterfaceRequestor> m_notificationCallbacks;
  RefPtr<nsIURI> m_uri;
  RefPtr<nsISupports> m_owner;
  nsCString m_contentType;
  nsCString m_charset;
  RefPtr<nsILoadInfo> m_loadInfo;
};

#endif

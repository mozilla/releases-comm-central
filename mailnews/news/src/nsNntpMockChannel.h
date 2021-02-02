/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsNntpMockChannel_h___
#define nsNntpMockChannel_h___

#include "nsIChannel.h"
#include "nsIMsgWindow.h"

#include "nsCOMPtr.h"
#include "nsString.h"
#include "nsHashPropertyBag.h"

class nsNNTPProtocol;

/**
 * nsNntpMockChannel is used to queue up NNTP operations when no connection
 * is available for immediate use.
 * It handles two distinct types of queued operation:
 * 1) non nsIChannel-based commands, issued via nsNNTPProtocol::LoadNewsUrl().
 * 2) nsIChannel operations. These are a little trickier, as the recipient
 *    expects the nsNntpMockChannel to follow the standard lifecycle of a
 *    nsIChannel, even though the bulk of the work is being passed over
 *    to a persistent, reusable nsNNTPProtocol object. So there is a degree
 *    of faking OnStartRequest/OnStopRequest nsIStreamListener callbacks to
 *    make this nsNntpMockChannel/nsNNTPProtocol amalgam act like a normal
 *    nsIChannel.
 *
 *  The different uses are determined by which constructor is used.
 */
class nsNntpMockChannel : public nsIChannel, public nsHashPropertyBag {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSICHANNEL
  NS_DECL_NSIREQUEST

  /**
   * Create a mockchannel for use as a nsIChannel.
   */
  nsNntpMockChannel(nsIURI* aUri, nsIMsgWindow* aMsgWindow);

  /**
   * Create a mockchannel for deferred LoadUrl() use.
   */
  nsNntpMockChannel(nsIURI* aUri, nsIMsgWindow* aMsgWindow,
                    nsISupports* aConsumer);

  nsresult AttachNNTPConnection(nsNNTPProtocol& protocol);

 protected:
  virtual ~nsNntpMockChannel();

  // The URL we will be running
  nsCOMPtr<nsIURI> m_url;

  // Variables for arguments to pass into the opening phase.
  nsCOMPtr<nsIStreamListener> m_channelListener;
  nsCOMPtr<nsISupports> m_context;
  nsCOMPtr<nsIMsgWindow> m_msgWindow;

  // The state we're in
  enum {
    CHANNEL_UNOPENED,         //!< No one bothered to open this yet
    CHANNEL_OPEN_WITH_LOAD,   //!< We should open with LoadNewsUrl
    CHANNEL_OPEN_WITH_ASYNC,  //!< We should open with AsyncOpen
    CHANNEL_CLOSED            //!< We were closed and should not open
  } m_channelState;

  // The protocol instance
  nsNNTPProtocol* m_protocol;

  // Temporary variables for accessors before we get to the actual instance.
  nsresult m_cancelStatus;
  nsCOMPtr<nsILoadGroup> m_loadGroup;
  nsCOMPtr<nsILoadInfo> m_loadInfo;
  nsLoadFlags m_loadFlags;

  nsCOMPtr<nsISupports> m_owner;
  nsCOMPtr<nsIInterfaceRequestor> m_notificationCallbacks;
  nsCString m_contentType;
  nsCString m_contentCharset;
  int64_t m_contentLength;
  uint32_t m_contentDisposition;
};

#endif  // nsNntpMockChannel_h___

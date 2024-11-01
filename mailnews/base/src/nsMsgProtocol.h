/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgProtocol_h__
#define nsMsgProtocol_h__

#include "nsIStreamListener.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIChannel.h"
#include "nsILoadGroup.h"
#include "nsIFile.h"
#include "nsCOMPtr.h"
#include "nsIInterfaceRequestor.h"
#include "nsIProgressEventSink.h"
#include "nsITransport.h"
#include "nsIAuthModule.h"
#include "nsString.h"
#include "nsHashPropertyBag.h"
#include "nsMailChannel.h"

class nsIMsgWindow;
class nsIPrompt;
class nsIMsgMailNewsUrl;
class nsIProxyInfo;
class nsICancelable;

// This is a helper class used to encapsulate code shared between all of the
// mailnews protocol objects (imap, news, pop, smtp, etc.) In particular,
// it unifies the core networking code for the protocols. My hope is that
// this will make unification with Necko easier as we'll only have to change
// this class and not all of the mailnews protocols.
class nsMsgProtocol : public nsIStreamListener,
                      public nsIChannel,
                      public nsITransportEventSink,
                      public nsMailChannel,
                      public nsHashPropertyBag {
 public:
  nsMsgProtocol(nsIURI* aURL);

  NS_DECL_ISUPPORTS_INHERITED
  // nsIChannel support
  NS_DECL_NSICHANNEL
  NS_DECL_NSIREQUEST

  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSITRANSPORTEVENTSINK

  // LoadUrl -- A protocol typically overrides this function, sets up any local
  // state for the url and then calls the base class which opens the socket if
  // it needs opened. If the socket is already opened then we just call
  // ProcessProtocolState to start the churning process. aConsumer is the
  // consumer for the url. It can be null if this argument is not appropriate
  virtual nsresult LoadUrl(nsIURI* aURL, nsISupports* aConsumer = nullptr);

  virtual nsresult SetUrl(
      nsIURI* aURL);  // sometimes we want to set the url before we load it
  void ShowAlertMessage(nsIMsgMailNewsUrl* aMsgUrl, nsresult aStatus);

  // Flag manipulators
  virtual bool TestFlag(uint32_t flag) { return flag & m_flags; }
  virtual void SetFlag(uint32_t flag) { m_flags |= flag; }
  virtual void ClearFlag(uint32_t flag) { m_flags &= ~flag; }

 protected:
  virtual ~nsMsgProtocol();

  // methods for opening and closing a socket with core netlib....
  // mscott -okay this is lame. I should break this up into a file protocol and
  // a socket based protocool class instead of cheating and putting both methods
  // here...

  // helper routine
  nsresult GetFileFromURL(nsIURI* aURL, nsIFile** aResult);
  // Used to open a file socket connection.
  virtual nsresult OpenFileSocket(nsIURI* aURL);

  virtual const char* GetType() { return nullptr; }
  nsresult GetQoSBits(uint8_t* aQoSBits);

  // a Protocol typically overrides this method. They free any of their own
  // connection state and then they call up into the base class to free the
  // generic connection objects
  virtual nsresult CloseSocket();

  // ProcessProtocolState - This is the function that gets churned by calls to
  // OnDataAvailable. As data arrives on the socket, OnDataAvailable calls
  // ProcessProtocolState.

  virtual nsresult ProcessProtocolState(nsIURI* url,
                                        nsIInputStream* inputStream,
                                        uint64_t sourceOffset,
                                        uint32_t length) = 0;

  virtual nsresult InitFromURI(nsIURI* aUrl);

  nsresult DoNtlmStep1(const nsACString& username, const nsAString& password,
                       nsCString& response);
  nsresult DoNtlmStep2(nsCString& commandResponse, nsCString& response);

  nsresult DoGSSAPIStep1(const nsACString& service, const char* username,
                         nsCString& response);
  nsresult DoGSSAPIStep2(nsCString& commandResponse, nsCString& response);
  // Output stream for writing commands to the socket
  nsCOMPtr<nsIOutputStream>
      m_outputStream;  // this will be obtained from the transport interface

  // Output stream for writing commands to the socket
  nsCOMPtr<nsITransport> m_transport;
  nsCOMPtr<nsIRequest> m_request;
  nsCOMPtr<nsICancelable> m_proxyRequest;

  bool m_socketIsOpen;  // mscott: we should look into keeping this state in the
                        // nsSocketTransport... I'm using it to make sure I open
                        // the socket the first time a URL is loaded into the
                        // connection
  uint32_t m_flags;     // used to store flag information

  nsCOMPtr<nsIFile>
      m_tempMsgFile;  // we currently have a hack where displaying a msg
                      // involves writing it to a temp file first

  // auth module for access to NTLM functions
  nsCOMPtr<nsIAuthModule> m_authModule;

  // the following is a catch all for nsIChannel related data
  nsCOMPtr<nsIURI> m_originalUrl;  // the original url
  nsCOMPtr<nsIURI> m_url;          // the running url
  nsCOMPtr<nsISupports> m_consumer;
  nsCOMPtr<nsIStreamListener> m_channelListener;
  bool m_isChannel;
  nsCOMPtr<nsILoadGroup> m_loadGroup;
  nsLoadFlags mLoadFlags;
  nsCOMPtr<nsIProgressEventSink> mProgressEventSink;
  nsCOMPtr<nsIInterfaceRequestor> mCallbacks;
  nsCOMPtr<nsISupports> mOwner;
  nsCString mContentType;
  nsCString mCharset;
  int64_t mContentLength;
  nsCOMPtr<nsILoadInfo> m_loadInfo;

  nsString m_lastPasswordSent;  // used to prefill the password prompt

  // if a url isn't going to result in any content then we want to suppress
  // calls to OnStartRequest, OnDataAvailable and OnStopRequest
  bool mSuppressListenerNotifications;

  uint32_t mContentDisposition;
};

#endif /* nsMsgProtocol_h__ */

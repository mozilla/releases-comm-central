/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsSyncRunnableHelpers_h
#define nsSyncRunnableHelpers_h

#include "nsThreadUtils.h"
#include "nsProxyRelease.h"

#include "nsIStreamListener.h"
#include "nsIInterfaceRequestor.h"
#include "nsIImapMailFolderSink.h"
#include "nsIImapServerSink.h"
#include "nsIImapProtocolSink.h"
#include "nsIImapMessageSink.h"

// The classes in this file proxy method calls to the main thread
// synchronously. The main thread must not block on this thread, or a
// deadlock condition can occur.

class StreamListenerProxy final : public nsIStreamListener
{
public:
  StreamListenerProxy(nsIStreamListener* receiver)
    : mReceiver(receiver)
  { }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

private:
  ~StreamListenerProxy() {
    nsCOMPtr<nsIThread> thread = do_GetMainThread();
    NS_ProxyRelease(thread, mReceiver);
  }
  nsCOMPtr<nsIStreamListener> mReceiver;
};

class ImapMailFolderSinkProxy final : public nsIImapMailFolderSink
{
public:
  ImapMailFolderSinkProxy(nsIImapMailFolderSink* receiver)
    : mReceiver(receiver)
  {
    NS_ASSERTION(receiver, "Don't allow receiver is nullptr");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPMAILFOLDERSINK

private:
  ~ImapMailFolderSinkProxy() {
    nsCOMPtr<nsIThread> thread = do_GetMainThread();
    NS_ProxyRelease(thread, mReceiver);
  }
  nsCOMPtr<nsIImapMailFolderSink> mReceiver;
};

class ImapServerSinkProxy final : public nsIImapServerSink
{
public:
  ImapServerSinkProxy(nsIImapServerSink* receiver)
    : mReceiver(receiver)
  { }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPSERVERSINK

private:
  ~ImapServerSinkProxy() {
    nsCOMPtr<nsIThread> thread = do_GetMainThread();
    NS_ProxyRelease(thread, mReceiver);
  }
  nsCOMPtr<nsIImapServerSink> mReceiver;
};


class ImapMessageSinkProxy final : public nsIImapMessageSink
{
public:
  ImapMessageSinkProxy(nsIImapMessageSink* receiver)
    : mReceiver(receiver)
  { }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPMESSAGESINK

private:
  ~ImapMessageSinkProxy() {
    nsCOMPtr<nsIThread> thread = do_GetMainThread();
    NS_ProxyRelease(thread, mReceiver);
  }
  nsCOMPtr<nsIImapMessageSink> mReceiver;
};

class ImapProtocolSinkProxy final : public nsIImapProtocolSink
{
public:
  ImapProtocolSinkProxy(nsIImapProtocolSink* receiver)
    : mReceiver(receiver)
  { }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPPROTOCOLSINK

private:
  ~ImapProtocolSinkProxy() {
    nsCOMPtr<nsIThread> thread = do_GetMainThread();
    NS_ProxyRelease(thread, mReceiver);
  }
  nsCOMPtr<nsIImapProtocolSink> mReceiver;
};
#endif // nsSyncRunnableHelpers_h

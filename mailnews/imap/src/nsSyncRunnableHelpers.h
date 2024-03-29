/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsSyncRunnableHelpers_h
#define nsSyncRunnableHelpers_h

#include "nsProxyRelease.h"

#include "mozilla/Monitor.h"
#include "msgIOAuth2Module.h"
#include "nsIStreamListener.h"
#include "nsIImapMailFolderSink.h"
#include "nsIImapServerSink.h"
#include "nsIImapProtocolSink.h"
#include "nsIImapMessageSink.h"

// The classes in this file proxy method calls to the main thread
// synchronously. The main thread must not block on this thread, or a
// deadlock condition can occur.

class StreamListenerProxy final : public nsIStreamListener {
 public:
  explicit StreamListenerProxy(nsIStreamListener* receiver)
      : mReceiver(receiver) {
    MOZ_DIAGNOSTIC_ASSERT(
        receiver, "Null receiver, crash now to get feedback instead of later");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

 private:
  ~StreamListenerProxy() {
    NS_ReleaseOnMainThread("StreamListenerProxy::mReceiver",
                           mReceiver.forget());
  }
  nsCOMPtr<nsIStreamListener> mReceiver;
};

class ImapMailFolderSinkProxy final : public nsIImapMailFolderSink {
 public:
  explicit ImapMailFolderSinkProxy(nsIImapMailFolderSink* receiver)
      : mReceiver(receiver) {
    MOZ_DIAGNOSTIC_ASSERT(
        receiver, "Null receiver, crash now to get feedback instead of later");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPMAILFOLDERSINK

 private:
  ~ImapMailFolderSinkProxy() {
    NS_ReleaseOnMainThread("ImapMailFolderSinkProxy::mReceiver",
                           mReceiver.forget());
  }
  nsCOMPtr<nsIImapMailFolderSink> mReceiver;
};

class ImapServerSinkProxy final : public nsIImapServerSink {
 public:
  explicit ImapServerSinkProxy(nsIImapServerSink* receiver)
      : mReceiver(receiver) {
    MOZ_DIAGNOSTIC_ASSERT(
        receiver, "Null receiver, crash now to get feedback instead of later");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPSERVERSINK

 private:
  ~ImapServerSinkProxy() {
    NS_ReleaseOnMainThread("ImapServerSinkProxy::mReceiver",
                           mReceiver.forget());
  }
  nsCOMPtr<nsIImapServerSink> mReceiver;
};

class ImapMessageSinkProxy final : public nsIImapMessageSink {
 public:
  explicit ImapMessageSinkProxy(nsIImapMessageSink* receiver)
      : mReceiver(receiver) {
    MOZ_DIAGNOSTIC_ASSERT(
        receiver, "Null receiver, crash now to get feedback instead of later");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPMESSAGESINK

 private:
  ~ImapMessageSinkProxy() {
    NS_ReleaseOnMainThread("ImapMessageSinkProxy::mReceiver",
                           mReceiver.forget());
  }
  nsCOMPtr<nsIImapMessageSink> mReceiver;
};

class ImapProtocolSinkProxy final : public nsIImapProtocolSink {
 public:
  explicit ImapProtocolSinkProxy(nsIImapProtocolSink* receiver)
      : mReceiver(receiver) {
    MOZ_DIAGNOSTIC_ASSERT(
        receiver, "Null receiver, crash now to get feedback instead of later");
  }

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPPROTOCOLSINK

 private:
  ~ImapProtocolSinkProxy() {
    NS_ReleaseOnMainThread("ImapProtocolSinkProxy::mReceiver",
                           mReceiver.forget());
  }
  nsCOMPtr<nsIImapProtocolSink> mReceiver;
};

class msgIOAuth2Module;
class nsIMsgIncomingServer;

namespace mozilla::mailnews {

class OAuth2ThreadHelper final : public msgIOAuth2ModuleListener {
 public:
  explicit OAuth2ThreadHelper(nsIMsgIncomingServer* aServer);

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_MSGIOAUTH2MODULELISTENER

  bool SupportsOAuth2();
  void GetXOAuth2String(nsACString& base64Str);

 private:
  ~OAuth2ThreadHelper();
  void Init();
  void Connect();

  Monitor mMonitor;
  nsCOMPtr<msgIOAuth2Module> mOAuth2Support;
  nsCOMPtr<nsIMsgIncomingServer> mServer;
  nsCString mOAuth2String;
};

}  // namespace mozilla::mailnews

#endif  // nsSyncRunnableHelpers_h

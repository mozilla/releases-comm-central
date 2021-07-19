/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nntpCore.h"
#include "nsMsgNewsCID.h"
#include "nsINntpUrl.h"
#include "nsIMsgNewsFolder.h"
#include "nsNNTPNewsgroupPost.h"
#include "nsIMsgIdentity.h"
#include "nsString.h"
#include "nsNewsUtils.h"
#include "nsNewsDatabase.h"
#include "nsMsgDBCID.h"
#include "nsMsgBaseCID.h"
#include "nsNntpService.h"
#include "nsIChannel.h"
#include "nsILoadGroup.h"
#include "nsCOMPtr.h"
#include "nsIMsgAccountManager.h"
#include "nsINntpIncomingServer.h"
#include "nsIDocShell.h"
#include "mozIDOMWindow.h"
#include "nsIMsgSearchSession.h"
#include "nsMailDirServiceDefs.h"
#include "nsIWebNavigation.h"
#include "nsNetCID.h"
#include "nsNewsDownloader.h"
#include "prprf.h"
#include "nsICacheStorage.h"
#include "nsICacheStorageService.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsIWindowWatcher.h"
#include "nsICommandLine.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgMailSession.h"
#include "nsISupportsPrimitives.h"
#include "nsIStreamListener.h"
#include "nsIInputStream.h"
#include "nsIURIMutator.h"
#include "nsTArray.h"
#include "nsDocShellLoadState.h"
#include "nsContentUtils.h"
#include "mozilla/LoadInfo.h"
#include "mozilla/Utf8.h"

#include "../../base/src/MailnewsLoadContextInfo.h"

#undef GetPort  // XXX Windows!
#undef SetPort  // XXX Windows!

#define PREF_MAIL_ROOT_NNTP \
  "mail.root.nntp"  // old - for backward compatibility only
#define PREF_MAIL_ROOT_NNTP_REL "mail.root.nntp-rel"

nsNntpService::nsNntpService() {
  mPrintingOperation = false;
  mOpenAttachmentOperation = false;
}

nsNntpService::~nsNntpService() {
  // do nothing
}

NS_IMPL_ISUPPORTS(nsNntpService, nsINntpService, nsIMsgMessageService,
                  nsIProtocolHandler, nsIMsgProtocolInfo, nsICommandLineHandler,
                  nsIMsgMessageFetchPartService, nsIContentHandler)

////////////////////////////////////////////////////////////////////////////////////////
// nsIMsgMessageService support
////////////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsNntpService::SaveMessageToDisk(const char* aMessageURI, nsIFile* aFile,
                                 bool aAddDummyEnvelope,
                                 nsIUrlListener* aUrlListener, nsIURI** aURL,
                                 bool canonicalLineEnding,
                                 nsIMsgWindow* aMsgWindow) {
  nsresult rv = NS_OK;
  NS_ENSURE_ARG_POINTER(aMessageURI);

  // double check it is a news-message:/ uri
  if (PL_strncmp(aMessageURI, kNewsMessageRootURI, kNewsMessageRootURILen)) {
    rv = NS_ERROR_UNEXPECTED;
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key = nsMsgKey_None;
  rv = DecomposeNewsMessageURI(aMessageURI, getter_AddRefs(folder), &key);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString messageIdURL;
  rv = CreateMessageIDURL(folder, key, getter_Copies(messageIdURL));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(messageIdURL.get(), aUrlListener, aMsgWindow,
                        aMessageURI, nsINntpUrl::ActionSaveMessageToDisk,
                        getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(url);
  if (msgUrl) {
    //        msgUrl->SetMessageFile(aFile);
    msgUrl->SetAddDummyEnvelope(aAddDummyEnvelope);
    msgUrl->SetCanonicalLineEnding(canonicalLineEnding);
  }

  bool hasMsgOffline = false;

  nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(url);
  if (folder) {
    nsCOMPtr<nsIMsgNewsFolder> newsFolder = do_QueryInterface(folder);
    if (newsFolder) {
      if (mailNewsUrl) {
        folder->HasMsgOffline(key, &hasMsgOffline);
        mailNewsUrl->SetMsgIsInLocalCache(hasMsgOffline);
      }
    }
  }

  if (mailNewsUrl) {
    nsCOMPtr<nsIStreamListener> saveAsListener;
    mailNewsUrl->GetSaveAsListener(aAddDummyEnvelope, aFile,
                                   getter_AddRefs(saveAsListener));

    rv = DisplayMessage(aMessageURI, saveAsListener,
                        /* nsIMsgWindow *aMsgWindow */ nullptr, aUrlListener,
                        nullptr /*aCharsetOverride */, aURL);
  }
  return rv;
}

nsresult nsNntpService::CreateMessageIDURL(nsIMsgFolder* folder, nsMsgKey key,
                                           char** url) {
  NS_ENSURE_ARG_POINTER(folder);
  NS_ENSURE_ARG_POINTER(url);
  if (key == nsMsgKey_None) return NS_ERROR_INVALID_ARG;

  nsresult rv;
  nsCOMPtr<nsIMsgNewsFolder> newsFolder = do_QueryInterface(folder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString messageID;
  rv = newsFolder->GetMessageIdForKey(key, messageID);
  NS_ENSURE_SUCCESS(rv, rv);

  // we need to escape the message ID,
  // it might contain characters which will mess us up later, like #
  // see bug #120502
  nsCString escapedMessageID;
  MsgEscapeString(messageID, nsINetUtil::ESCAPE_URL_PATH, escapedMessageID);

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = folder->GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString rootFolderURI;
  rv = rootFolder->GetURI(rootFolderURI);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString groupName;
  rv = folder->GetName(groupName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString uri;
  uri = rootFolderURI.get();
  uri += '/';
  uri += escapedMessageID;
  uri += kNewsURIGroupQuery;  // ?group=
  AppendUTF16toUTF8(groupName, uri);
  uri += kNewsURIKeyQuery;  // &key=
  uri.AppendInt(key);
  *url = ToNewCString(uri);

  if (!*url) return NS_ERROR_OUT_OF_MEMORY;

  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::DisplayMessage(const char* aMessageURI,
                              nsISupports* aDisplayConsumer,
                              nsIMsgWindow* aMsgWindow,
                              nsIUrlListener* aUrlListener,
                              const char* aCharsetOverride, nsIURI** aURL) {
  nsresult rv = NS_OK;
  NS_ENSURE_ARG_POINTER(aMessageURI);

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key = nsMsgKey_None;
  rv = DecomposeNewsMessageURI(aMessageURI, getter_AddRefs(folder), &key);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString urlStr;
  // if we are displaying (or printing), we want the news://host/message-id url
  // we keep the original uri around, for cancelling and so we can get to the
  // articles by doing GROUP and then ARTICLE <n>.
  //
  // using news://host/message-id has an extra benefit.
  // we'll use that to look up in the cache, so if
  // you are reading a message that you've already read, you
  // (from a cross post) it would be in your cache.
  rv = CreateMessageIDURL(folder, key, getter_Copies(urlStr));
  NS_ENSURE_SUCCESS(rv, rv);

  // rhp: If we are displaying this message for the purposes of printing, append
  // the magic operand.
  if (mPrintingOperation) urlStr.AppendLiteral("?header=print");

  nsNewsAction action = nsINntpUrl::ActionFetchArticle;
  if (mOpenAttachmentOperation) action = nsINntpUrl::ActionFetchPart;

  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(urlStr.get(), aUrlListener, aMsgWindow, aMessageURI,
                        action, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgI18NUrl> i18nurl = do_QueryInterface(url, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  i18nurl->SetCharsetOverRide(aCharsetOverride);

  bool shouldStoreMsgOffline = false;

  if (folder) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    // We need to set the port on the url, just like
    // nsNNTPProtocol::Initialize does, so the specs will be the same.
    // we can ignore errors here - worst case, we'll display the
    // "message not available" message.
    rv = folder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    int32_t port = 0;
    rv = url->GetPort(&port);
    if (NS_FAILED(rv) || (port <= 0)) {
      rv = server->GetPort(&port);
      if (NS_FAILED(rv) || (port <= 0)) {
        int32_t socketType;
        rv = server->GetSocketType(&socketType);
        NS_ENSURE_SUCCESS(rv, rv);

        port = (socketType == nsMsgSocketType::SSL)
                   ? nsINntpUrl::DEFAULT_NNTPS_PORT
                   : nsINntpUrl::DEFAULT_NNTP_PORT;
      }

      // Don't mutate/clone here.
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(url);
      rv = mailnewsurl->SetPortInternal(port);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    folder->ShouldStoreMsgOffline(key, &shouldStoreMsgOffline);

    // Look for the message in the offline cache
    bool hasMsgOffline = false;
    folder->HasMsgOffline(key, &hasMsgOffline);

    // Now look in the memory cache
    if (!hasMsgOffline) {
      rv = IsMsgInMemCache(url, folder, &hasMsgOffline);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // If the message is not found in either, then we might need to return
    if (!hasMsgOffline && WeAreOffline())
      return server->DisplayOfflineMsg(aMsgWindow);

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(url, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    mailnewsurl->SetMsgIsInLocalCache(hasMsgOffline);

    nsCOMPtr<nsIMsgNewsFolder> newsFolder(do_QueryInterface(folder, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    newsFolder->SetSaveArticleOffline(shouldStoreMsgOffline);
  }

  rv = GetMessageFromUrl(url, aMsgWindow, aDisplayConsumer);
  if (aURL) url.forget(aURL);
  return rv;
}

nsresult nsNntpService::GetMessageFromUrl(nsIURI* aUrl,
                                          nsIMsgWindow* aMsgWindow,
                                          nsISupports* aDisplayConsumer) {
  nsresult rv;
  // if the consumer is the docshell then we want to run the url in the webshell
  // in order to display it. If it isn't a docshell then just run the news url
  // like we would any other news url.
  nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
  if (NS_SUCCEEDED(rv)) {
    // DIRTY LITTLE HACK --> if we are opening an attachment we want the
    // docshell to treat this load as if it were a user click event. Then the
    // dispatching stuff will be much happier.
    RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(aUrl);
    loadState->SetLoadFlags(mOpenAttachmentOperation
                                ? nsIWebNavigation::LOAD_FLAGS_IS_LINK
                                : nsIWebNavigation::LOAD_FLAGS_NONE);
    if (mOpenAttachmentOperation) loadState->SetLoadType(LOAD_LINK);
    loadState->SetFirstParty(false);
    loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
    rv = docShell->LoadURI(loadState, false);
  } else {
    nsCOMPtr<nsIStreamListener> aStreamListener(
        do_QueryInterface(aDisplayConsumer, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIChannel> aChannel;
      nsCOMPtr<nsILoadGroup> aLoadGroup;
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aUrl, &rv);
      if (NS_SUCCEEDED(rv) && mailnewsUrl) {
        if (aMsgWindow) mailnewsUrl->SetMsgWindow(aMsgWindow);
        mailnewsUrl->GetLoadGroup(getter_AddRefs(aLoadGroup));
      }
      nsCOMPtr<nsILoadInfo> loadInfo = new mozilla::net::LoadInfo(
          nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
          nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
          nsIContentPolicy::TYPE_OTHER);
      rv = NewChannel(aUrl, loadInfo, getter_AddRefs(aChannel));
      if (NS_FAILED(rv)) return rv;

      rv = aChannel->SetLoadGroup(aLoadGroup);
      if (NS_FAILED(rv)) return rv;

      //  now try to open the channel passing in our display consumer as the
      //  listener
      rv = aChannel->AsyncOpen(aStreamListener);
    } else
      rv = RunNewsUrl(aUrl, aMsgWindow, aDisplayConsumer);
  }
  return rv;
}

NS_IMETHODIMP
nsNntpService::FetchMessage(nsIMsgFolder* folder, nsMsgKey key,
                            nsIMsgWindow* aMsgWindow, nsISupports* aConsumer,
                            nsIUrlListener* aUrlListener, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(folder);
  nsresult rv;
  nsCOMPtr<nsIMsgNewsFolder> msgNewsFolder = do_QueryInterface(folder, &rv);
  mozilla::Unused << msgNewsFolder;
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = folder->GetMessageHeader(key, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString originalMessageUri;
  rv = folder->GetUriForMsg(hdr, originalMessageUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString messageIdURL;
  rv = CreateMessageIDURL(folder, key, getter_Copies(messageIdURL));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(messageIdURL.get(), aUrlListener, aMsgWindow,
                        originalMessageUri.get(),
                        nsINntpUrl::ActionFetchArticle, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = RunNewsUrl(url, aMsgWindow, aConsumer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aURL) url.forget(aURL);
  return rv;
}

NS_IMETHODIMP nsNntpService::FetchMimePart(
    nsIURI* aURI, const char* aMessageURI, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, nsIURI** aURL) {
  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(aURI, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  msgUrl->SetMsgWindow(aMsgWindow);

  // set up the url listener
  if (aUrlListener) msgUrl->RegisterListener(aUrlListener);

  // this code isn't ready yet, but it helps getting opening attachments
  // while offline working
  //    nsCOMPtr<nsIMsgMessageUrl> msgMessageUrl = do_QueryInterface(aURI);
  //    if (msgMessageUrl)
  //    {
  //      nsAutoCString spec;
  //      rv = aURI->GetSpec(spec);
  //      NS_ENSURE_SUCCESS(rv, rv);
  //      msgMessageUrl->SetOriginalSpec(spec.get());
  //    }
  return RunNewsUrl(msgUrl, aMsgWindow, aDisplayConsumer);
}

NS_IMETHODIMP nsNntpService::OpenAttachment(
    const char* aContentType, const char* aFileName, const char* aUrl,
    const char* aMessageUri, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener) {
  NS_ENSURE_ARG_POINTER(aUrl);
  NS_ENSURE_ARG_POINTER(aFileName);

  nsCOMPtr<nsIURI> url;
  nsresult rv = NS_OK;
  nsAutoCString newsUrl;
  newsUrl = aUrl;
  newsUrl += "&type=";
  newsUrl += aContentType;
  newsUrl += "&filename=";
  newsUrl += aFileName;

  NewURI(newsUrl, nullptr, nullptr, getter_AddRefs(url));

  if (NS_SUCCEEDED(rv) && url) {
    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(url, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    msgUrl->SetMsgWindow(aMsgWindow);
    msgUrl->SetFileNameInternal(nsDependentCString(aFileName));
    // this code isn't ready yet, but it helps getting opening attachments
    // while offline working
    //   nsCOMPtr<nsIMsgMessageUrl> msgMessageUrl = do_QueryInterface(url);
    //    if (msgMessageUrl)
    //      msgMessageUrl->SetOriginalSpec(newsUrl.get());
    // set up the url listener
    if (aUrlListener) msgUrl->RegisterListener(aUrlListener);

    nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
    if (NS_SUCCEEDED(rv) && docShell) {
      RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(url);
      loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_IS_LINK);
      loadState->SetLoadType(LOAD_LINK);
      loadState->SetFirstParty(false);
      loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
      return docShell->LoadURI(loadState, false);
    } else {
      return RunNewsUrl(url, aMsgWindow, aDisplayConsumer);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsNntpService::GetUrlForUri(const nsACString& aMessageURI,
                                          nsIMsgWindow* aMsgWindow,
                                          nsIURI** aURL) {
  nsresult rv = NS_OK;
  const nsCString& temp = PromiseFlatCString(aMessageURI);

  // double check that it is a news-message:/ uri
  if (PL_strncmp(temp.get(), kNewsMessageRootURI, kNewsMessageRootURILen)) {
    rv = NS_ERROR_UNEXPECTED;
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key = nsMsgKey_None;
  rv = DecomposeNewsMessageURI(temp.get(), getter_AddRefs(folder), &key);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString messageIdURL;
  rv = CreateMessageIDURL(folder, key, getter_Copies(messageIdURL));
  NS_ENSURE_SUCCESS(rv, rv);

  // this is only called by view message source
  rv = ConstructNntpUrl(messageIdURL.get(), nullptr, aMsgWindow, temp.get(),
                        nsINntpUrl::ActionFetchArticle, aURL);
  NS_ENSURE_SUCCESS(rv, rv);
  if (folder && *aURL) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(*aURL);
    if (mailnewsUrl) {
      bool useLocalCache = false;
      folder->HasMsgOffline(key, &useLocalCache);
      mailnewsUrl->SetMsgIsInLocalCache(useLocalCache);
    }
  }
  return rv;
}

NS_IMETHODIMP
nsNntpService::DecomposeNewsURI(const char* uri, nsIMsgFolder** folder,
                                nsMsgKey* aMsgKey) {
  nsresult rv;

  rv = DecomposeNewsMessageURI(uri, folder, aMsgKey);

  return rv;
}

nsresult nsNntpService::DecomposeNewsMessageURI(const char* aMessageURI,
                                                nsIMsgFolder** aFolder,
                                                nsMsgKey* aMsgKey) {
  NS_ENSURE_ARG_POINTER(aMessageURI);
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aMsgKey);

  nsresult rv = NS_OK;

  // Construct the news URL
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl =
      do_CreateInstance(NS_NNTPURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsINntpUrl> nntpUrl = do_QueryInterface(mailnewsurl, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mailnewsurl->SetSpecInternal(nsDependentCString(aMessageURI));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the group name and key from the url
  nsAutoCString groupName;
  rv = nntpUrl->GetGroup(groupName);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = nntpUrl->GetKey(aMsgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  // If there is no group, try the harder way.
  if (groupName.IsEmpty()) {
    *aMsgKey = nsMsgKey_None;
    return GetFolderFromUri(aMessageURI, aFolder);
  }

  return mailnewsurl->GetFolder(aFolder);
}

nsresult nsNntpService::GetFolderFromUri(const char* aUri,
                                         nsIMsgFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aUri);
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), nsDependentCString(aUri));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString path;
  rv = uri->GetPathQueryRef(path);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = accountManager->FindServerByURI(uri, false, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = server->GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // check if path is "/"
  // if so, use the root folder
  if (path.Length() == 1) {
    rootFolder.forget(aFolder);
    return NS_OK;
  }

  // the URI is news://host/(escaped group)
  // but the *name* of the newsgroup (we are calling ::GetChildNamed())
  // is unescaped.  see http://bugzilla.mozilla.org/show_bug.cgi?id=210089#c17
  // for more about this
  nsCString unescapedPath;
  MsgUnescapeString(Substring(path, 1), 0,
                    unescapedPath); /* skip the leading slash */

  nsCOMPtr<nsIMsgFolder> subFolder;
  rv = rootFolder->GetChildNamed(NS_ConvertUTF8toUTF16(unescapedPath),
                                 getter_AddRefs(subFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  subFolder.forget(aFolder);
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::CopyMessage(const char* aSrcMessageURI,
                           nsIStreamListener* aMailboxCopyHandler,
                           bool moveMessage, nsIUrlListener* aUrlListener,
                           nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aSrcMessageURI);
  NS_ENSURE_ARG_POINTER(aMailboxCopyHandler);

  nsresult rv;
  nsCOMPtr<nsISupports> streamSupport =
      do_QueryInterface(aMailboxCopyHandler, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = DisplayMessage(aSrcMessageURI, streamSupport, aMsgWindow, aUrlListener,
                      nullptr, aURL);
  return rv;
}

NS_IMETHODIMP
nsNntpService::CopyMessages(const nsTArray<nsMsgKey>& akeys,
                            nsIMsgFolder* srcFolder,
                            nsIStreamListener* aMailboxCopyHandler,
                            bool moveMessage, nsIUrlListener* aUrlListener,
                            nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsNntpService::FindServerWithNewsgroup(nsCString& host,
                                                nsCString& groupName) {
  nsresult rv;

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgIncomingServer>> servers;
  rv = accountManager->GetAllServers(servers);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(mozilla::IsUtf8(groupName), "newsgroup is not in UTF-8");

  // XXX TODO
  // this only looks at the list of subscribed newsgroups.
  // fix to use the hostinfo.dat information

  for (auto server : servers) {
    nsCOMPtr<nsINntpIncomingServer> newsserver = do_QueryInterface(server);
    if (!newsserver) {
      continue;
    }

    bool containsGroup = false;
    rv = newsserver->ContainsNewsgroup(groupName, &containsGroup);
    if (containsGroup) {
      return server->GetHostName(host);
    }
  }
  return NS_OK;
}

nsresult nsNntpService::FindHostFromGroup(nsCString& host,
                                          nsCString& groupName) {
  nsresult rv = NS_OK;
  // host always comes in as ""
  NS_ASSERTION(host.IsEmpty(), "host is not empty");
  if (!host.IsEmpty()) return NS_ERROR_FAILURE;

  rv = FindServerWithNewsgroup(host, groupName);
  NS_ENSURE_SUCCESS(rv, rv);

  // host can be empty
  return NS_OK;
}

nsresult nsNntpService::SetUpNntpUrlForPosting(const char* aAccountKey,
                                               char** newsUrlSpec) {
  nsresult rv = NS_OK;

  nsCString host;
  int32_t port = -1;

  nsCOMPtr<nsIMsgIncomingServer> nntpServer;
  rv = GetNntpServerByAccount(aAccountKey, getter_AddRefs(nntpServer));
  if (NS_SUCCEEDED(rv) && nntpServer) {
    nntpServer->GetHostName(host);
    nntpServer->GetPort(&port);
  } else {
    NS_WARNING("Failure to obtain host and port");
  }

  *newsUrlSpec = PR_smprintf("%s/%s:%d", kNewsRootURI,
                             host.IsEmpty() ? "news" : host.get(), port);
  if (!*newsUrlSpec) return NS_ERROR_FAILURE;
  return NS_OK;
}
////////////////////////////////////////////////////////////////////////////////
// nsINntpService support
////////////////////////////////////////////////////////////////////////////////
// XXX : may not work with non-ASCII newsgroup names and IDN hostnames
NS_IMETHODIMP
nsNntpService::GenerateNewsHeaderValsForPosting(
    const nsACString& newsgroupsList, char** newsgroupsHeaderVal,
    char** newshostHeaderVal) {
  nsresult rv = NS_OK;

  NS_ENSURE_ARG_POINTER(newsgroupsHeaderVal);
  NS_ENSURE_ARG_POINTER(newshostHeaderVal);

  // newsgroupsList can be a comma separated list of these:
  // news://host/group
  // news://group
  // host/group
  // group
  //
  // we are not going to allow the user to cross post to multiple hosts.
  // if we detect that, we stop and return error.

  nsAutoCString host;
  nsAutoCString newsgroups;

  nsTArray<nsCString> list;
  ParseString(newsgroupsList, ',', list);
  for (uint32_t index = 0; index < list.Length(); index++) {
    list[index].StripWhitespace();
    if (!list[index].IsEmpty()) {
      nsAutoCString currentHost;
      nsAutoCString theRest;
      // does list[index] start with "news:/"?
      if (StringBeginsWith(list[index], nsLiteralCString(kNewsRootURI))) {
        // we have news://group or news://host/group
        // set theRest to what's after news://
        theRest = Substring(list[index], kNewsRootURILen /* for news:/ */ +
                                             1 /* for the slash */);
      } else if (list[index].Find(":/") != -1) {
        // we have x:/y where x != news. this is bad, return failure
        return NS_ERROR_FAILURE;
      } else
        theRest = list[index];

      // theRest is "group" or "host/group"
      int32_t slashpos = theRest.FindChar('/');
      if (slashpos > 0) {
        nsAutoCString currentGroup;

        // theRest is "host/group"
        currentHost = StringHead(theRest, slashpos);

        // from "host/group", put "group" into currentGroup;
        currentGroup = Substring(theRest, slashpos + 1);

        NS_ASSERTION(!currentGroup.IsEmpty(), "currentGroup is empty");
        if (currentGroup.IsEmpty()) return NS_ERROR_FAILURE;

        // build up the newsgroups
        if (!newsgroups.IsEmpty()) newsgroups += ",";
        newsgroups += currentGroup;
      } else {
        // theRest is "group"
        rv = FindHostFromGroup(currentHost, theRest);
        if (NS_FAILED(rv)) return rv;
        // build up the newsgroups
        if (!newsgroups.IsEmpty()) newsgroups += ",";
        newsgroups += theRest;
      }

      if (!currentHost.IsEmpty()) {
        if (host.IsEmpty())
          host = currentHost;
        else {
          if (!host.Equals(currentHost)) return NS_ERROR_NNTP_NO_CROSS_POSTING;
        }
      }
      currentHost = "";
    }
  }

  *newshostHeaderVal = ToNewCString(host);
  if (!*newshostHeaderVal) return NS_ERROR_OUT_OF_MEMORY;

  *newsgroupsHeaderVal = ToNewCString(newsgroups);
  if (!*newsgroupsHeaderVal) return NS_ERROR_OUT_OF_MEMORY;

  return NS_OK;
}

nsresult nsNntpService::GetNntpServerByAccount(
    const char* aAccountKey, nsIMsgIncomingServer** aNntpServer) {
  NS_ENSURE_ARG_POINTER(aNntpServer);
  nsresult rv = NS_ERROR_FAILURE;

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (aAccountKey) {
    nsCOMPtr<nsIMsgAccount> account;
    rv = accountManager->GetAccount(nsDependentCString(aAccountKey),
                                    getter_AddRefs(account));
    if (NS_SUCCEEDED(rv) && account)
      rv = account->GetIncomingServer(aNntpServer);
  }

  // if we don't have a news host, find the first news server and use it
  if (NS_FAILED(rv) || !*aNntpServer)
    rv = accountManager->FindServer(EmptyCString(), EmptyCString(), "nntp"_ns,
                                    aNntpServer);

  return rv;
}

NS_IMETHODIMP
nsNntpService::PostMessage(nsIFile* aFileToPost, const char* newsgroupsNames,
                           const char* aAccountKey,
                           nsIUrlListener* aUrlListener,
                           nsIMsgWindow* aMsgWindow, nsIURI** _retval) {
  // aMsgWindow might be null
  NS_ENSURE_ARG_POINTER(newsgroupsNames);

  NS_ENSURE_ARG(*newsgroupsNames);

  nsresult rv;

  nsCOMPtr<nsINntpUrl> nntpUrl = do_CreateInstance(NS_NNTPURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = nntpUrl->SetNewsAction(nsINntpUrl::ActionPostArticle);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString newsUrlSpec;
  rv = SetUpNntpUrlForPosting(aAccountKey, getter_Copies(newsUrlSpec));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(nntpUrl, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailnewsurl->SetSpecInternal(newsUrlSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aUrlListener)  // register listener if there is one...
    mailnewsurl->RegisterListener(aUrlListener);

  nsCOMPtr<nsINNTPNewsgroupPost> post =
      do_CreateInstance(NS_NNTPNEWSGROUPPOST_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = post->SetPostMessageFile(aFileToPost);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = nntpUrl->SetMessageToPost(post);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url = do_QueryInterface(nntpUrl);
  rv = RunNewsUrl(url, aMsgWindow, nullptr /* consumer */);
  NS_ENSURE_SUCCESS(rv, rv);

  if (_retval) rv = CallQueryInterface(nntpUrl, _retval);

  return rv;
}

nsresult nsNntpService::ConstructNntpUrl(const char* urlString,
                                         nsIUrlListener* aUrlListener,
                                         nsIMsgWindow* aMsgWindow,
                                         const char* originalMessageUri,
                                         int32_t action, nsIURI** aUrl) {
  nsresult rv = NS_OK;

  nsCOMPtr<nsINntpUrl> nntpUrl = do_CreateInstance(NS_NNTPURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(nntpUrl);
  mailnewsurl->SetMsgWindow(aMsgWindow);
  nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(nntpUrl);
  rv = mailnewsurl->SetSpecInternal(nsDependentCString(urlString));
  NS_ENSURE_SUCCESS(rv, rv);
  nntpUrl->SetNewsAction(action);

  if (originalMessageUri) {
    msgUrl->SetUri(nsDependentCString(originalMessageUri));
    NS_ENSURE_SUCCESS(rv, rv);
    // we'll use this later in nsNNTPProtocol::ParseURL()
    rv = msgUrl->SetOriginalSpec(originalMessageUri);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (aUrlListener)  // register listener if there is one...
    mailnewsurl->RegisterListener(aUrlListener);

  mailnewsurl.forget(aUrl);
  return rv;
}

nsresult nsNntpService::CreateNewsAccount(const char* aHostname, bool aUseSSL,
                                          int32_t aPort,
                                          nsIMsgIncomingServer** aServer) {
  NS_ENSURE_ARG_POINTER(aHostname);
  NS_ENSURE_ARG_POINTER(aServer);

  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgAccount> account;
  rv = accountManager->CreateAccount(getter_AddRefs(account));
  if (NS_FAILED(rv)) return rv;

  // for news, username is always null
  rv = accountManager->CreateIncomingServer(
      EmptyCString(), nsDependentCString(aHostname), "nntp"_ns, aServer);
  if (NS_FAILED(rv)) return rv;

  if (aUseSSL) {
    rv = (*aServer)->SetSocketType(nsMsgSocketType::SSL);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = (*aServer)->SetPort(aPort);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgIdentity> identity;
  rv = accountManager->CreateIdentity(getter_AddRefs(identity));
  if (NS_FAILED(rv)) return rv;
  if (!identity) return NS_ERROR_FAILURE;

  // by default, news accounts should be composing in plain text
  rv = identity->SetComposeHtml(false);
  NS_ENSURE_SUCCESS(rv, rv);

  // the identity isn't filled in, so it is not valid.
  rv = (*aServer)->SetValid(false);
  if (NS_FAILED(rv)) return rv;

  // hook them together
  rv = account->SetIncomingServer(*aServer);
  if (NS_FAILED(rv)) return rv;
  rv = account->AddIdentity(identity);
  if (NS_FAILED(rv)) return rv;

  // Now save the new acct info to pref file.
  rv = accountManager->SaveAccountInfo();
  if (NS_FAILED(rv)) return rv;

  return NS_OK;
}

nsresult nsNntpService::GetServerForUri(nsIURI* aUri,
                                        nsINntpIncomingServer** aServer) {
  nsAutoCString hostName;
  nsAutoCString scheme;
  nsAutoCString path;
  int32_t port = 0;
  nsresult rv;

  rv = aUri->GetAsciiHost(hostName);
  rv = aUri->GetScheme(scheme);
  rv = aUri->GetPort(&port);
  rv = aUri->GetPathQueryRef(path);

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // find the incoming server, it if exists.
  // migrate if necessary, before searching for it.
  // if it doesn't exist, create it.
  nsCOMPtr<nsIMsgIncomingServer> server;

  // Grab all servers for if this is a no-authority URL. This also loads
  // accounts if they haven't been loaded, i.e., we're running this straight
  // from the command line
  nsTArray<RefPtr<nsIMsgIncomingServer>> servers;
  rv = accountManager->GetAllServers(servers);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(aUri, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailUrl->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!server && !hostName.IsEmpty()) {
    // If we don't have this server but it isn't no-auth, add it.
    // Ideally, we should remove this account quickly (see bug 41133)
    bool useSSL = false;
    if (scheme.EqualsLiteral("snews") || scheme.EqualsLiteral("nntps")) {
      useSSL = true;
      if ((port == 0) || (port == -1)) port = nsINntpUrl::DEFAULT_NNTPS_PORT;
    }
    rv =
        CreateNewsAccount(hostName.get(), useSSL, port, getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (!server && hostName.IsEmpty())
    // XXX: Until we support no-auth uris, bail
    return NS_ERROR_FAILURE;

  if (!server) return NS_ERROR_FAILURE;

  nsCOMPtr<nsINntpIncomingServer> nntpServer;
  nntpServer = do_QueryInterface(server, &rv);

  if (!nntpServer || NS_FAILED(rv)) return rv;

  nntpServer.forget(aServer);

  nsAutoCString spec;
  rv = aUri->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

#if 0  // this not ready yet.
  nsNewsAction action = nsINntpUrl::ActionUnknown;
  nsCOMPtr <nsINntpUrl> nntpUrl = do_QueryInterface(aUri);
  if (nntpUrl) {
    rv = nntpUrl->GetNewsAction(&action);
    NS_ENSURE_SUCCESS(rv,rv);
  }

  // if this is a news-message:/ uri, decompose it and set hasMsgOffline on the uri
  // Or, if it's of this form, we need to do the same.
  // "news://news.mozilla.org:119/3D612B96.1050301%40netscape.com?part=1.2&type=image/gif&filename=hp_icon_logo.gif"

  // XXX todo, or do we want to check if it is a news-message:// uri or
  // a news:// uri (but action is not a fetch related action?)
  if (!PL_strncmp(spec.get(), kNewsMessageRootURI, kNewsMessageRootURILen) ||
      (action == nsINntpUrl::ActionFetchPart || action == nsINntpUrl::ActionFetchArticle))
  {
#else
  // if this is a news-message:/ uri, decompose it and set hasMsgOffline on the
  // uri
  if (!PL_strncmp(spec.get(), kNewsMessageRootURI, kNewsMessageRootURILen)) {
#endif
  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key = nsMsgKey_None;
  rv = DecomposeNewsMessageURI(spec.get(), getter_AddRefs(folder), &key);
  if (NS_SUCCEEDED(rv) && folder) {
    bool hasMsgOffline = false;
    folder->HasMsgOffline(key, &hasMsgOffline);
    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(aUri));
    if (msgUrl) msgUrl->SetMsgIsInLocalCache(hasMsgOffline);
  }
}

return NS_OK;
}

nsresult nsNntpService::RunNewsUrl(nsIURI* aUri, nsIMsgWindow* aMsgWindow,
                                   nsISupports* aConsumer) {
  nsresult rv;

  if (WeAreOffline()) return NS_MSG_ERROR_OFFLINE;

  // almost there...now create a nntp protocol instance to run the url in...
  nsCOMPtr<nsINntpIncomingServer> server;
  rv = GetServerForUri(aUri, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  return server->LoadNewsUrl(aUri, aMsgWindow, aConsumer);
}

NS_IMETHODIMP nsNntpService::GetNewNews(nsINntpIncomingServer* nntpServer,
                                        const char* uri, bool aGetOld,
                                        nsIUrlListener* aUrlListener,
                                        nsIMsgWindow* aMsgWindow,
                                        nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(uri);

  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgIncomingServer> server;
  server = do_QueryInterface(nntpServer);

  /* double check that it is a "news:/" url */
  if (strncmp(uri, kNewsRootURI, kNewsRootURILen) == 0) {
    nsCOMPtr<nsIURI> url;
    rv = ConstructNntpUrl(uri, aUrlListener, aMsgWindow, nullptr,
                          nsINntpUrl::ActionGetNewNews, getter_AddRefs(url));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsINntpUrl> nntpUrl = do_QueryInterface(url);
    if (nntpUrl) {
      rv = nntpUrl->SetGetOldMessages(aGetOld);
      if (NS_FAILED(rv)) return rv;
    }

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(url);
    if (mailNewsUrl) mailNewsUrl->SetUpdatingFolder(true);

    rv = RunNewsUrl(url, aMsgWindow, nullptr);

    if (_retval) url.forget(_retval);
  } else {
    NS_ERROR("not a news:/ url");
    rv = NS_ERROR_FAILURE;
  }

  return rv;
}

NS_IMETHODIMP
nsNntpService::CancelMessage(const char* cancelURL, const char* messageURI,
                             nsISupports* aConsumer,
                             nsIUrlListener* aUrlListener,
                             nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  nsresult rv;
  NS_ENSURE_ARG_POINTER(cancelURL);
  NS_ENSURE_ARG_POINTER(messageURI);

  nsCOMPtr<nsIURI> url;
  // the url should be "news://host/message-id?cancel"
  rv = ConstructNntpUrl(cancelURL, aUrlListener, aMsgWindow, messageURI,
                        nsINntpUrl::ActionCancelArticle, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = RunNewsUrl(url, aMsgWindow, aConsumer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aURL) url.forget(aURL);

  return rv;
}

NS_IMETHODIMP nsNntpService::GetScheme(nsACString& aScheme) {
  aScheme = "news";
  return NS_OK;
}

NS_IMETHODIMP nsNntpService::GetDefaultDoBiff(bool* aDoBiff) {
  NS_ENSURE_ARG_POINTER(aDoBiff);
  // by default, don't do biff for NNTP servers
  *aDoBiff = false;
  return NS_OK;
}

NS_IMETHODIMP nsNntpService::GetDefaultPort(int32_t* aDefaultPort) {
  NS_ENSURE_ARG_POINTER(aDefaultPort);
  *aDefaultPort = nsINntpUrl::DEFAULT_NNTP_PORT;
  return NS_OK;
}

NS_IMETHODIMP nsNntpService::AllowPort(int32_t port, const char* scheme,
                                       bool* _retval) {
  *_retval = true;  // allow news on any port
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetDefaultServerPort(bool aUseSSL, int32_t* aDefaultPort) {
  nsresult rv = NS_OK;

  // Return Secure NNTP Port if secure option chosen i.e., if useSSL is TRUE.
  if (aUseSSL)
    *aDefaultPort = nsINntpUrl::DEFAULT_NNTPS_PORT;
  else
    rv = GetDefaultPort(aDefaultPort);

  return rv;
}

NS_IMETHODIMP nsNntpService::GetProtocolFlags(uint32_t* aUritype) {
  NS_ENSURE_ARG_POINTER(aUritype);
  *aUritype = URI_NORELATIVE | URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
              URI_LOADABLE_BY_ANYONE | ALLOWS_PROXY | URI_FORBIDS_COOKIE_ACCESS
#ifdef IS_ORIGIN_IS_FULL_SPEC_DEFINED
              | ORIGIN_IS_FULL_SPEC
#endif
      ;

  return NS_OK;
}

nsresult nsNntpService::NewURI(const nsACString& aSpec,
                               const char* aCharset,  // ignored
                               nsIURI* aBaseURI, nsIURI** _retval) {
  nsresult rv;

  nsCOMPtr<nsIMsgMailNewsUrl> nntpUri =
      do_CreateInstance(NS_NNTPURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aBaseURI) {
    nsAutoCString newSpec;
    aBaseURI->Resolve(aSpec, newSpec);
    rv = nntpUri->SetSpecInternal(newSpec);
    // XXX Consider: rv = NS_MutateURI(new
    // nsNntpUrl::Mutator()).SetSpec(newSpec).Finalize(nntpUri);
  } else {
    rv = nntpUri->SetSpecInternal(aSpec);
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nntpUri.forget(_retval);
  return NS_OK;
}

NS_IMETHODIMP nsNntpService::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                        nsIChannel** _retval) {
  NS_ENSURE_ARG_POINTER(aURI);
  MOZ_ASSERT(aLoadInfo);
  nsresult rv = NS_OK;
  nsCOMPtr<nsINntpIncomingServer> server;
  rv = GetServerForUri(aURI, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIChannel> channel;
  rv = server->GetNntpChannel(aURI, nullptr, getter_AddRefs(channel));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = channel->SetLoadInfo(aLoadInfo);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString spec;
  rv = aURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  // Add the attachment disposition. This forces docShell to open the
  // attachment instead of displaying it. Content types we have special
  // handlers for are white-listed. This white list also exists in
  // nsMailboxService::NewChannel and nsImapService::NewChannel, so if you're
  // changing this, update those too.
  if (spec.Find("part=") >= 0 && spec.Find("type=message/rfc822") < 0 &&
      spec.Find("type=application/x-message-display") < 0 &&
      spec.Find("type=application/pdf") < 0) {
    rv = channel->SetContentDisposition(nsIChannel::DISPOSITION_ATTACHMENT);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    rv = channel->SetContentDisposition(nsIChannel::DISPOSITION_INLINE);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  channel.forget(_retval);
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::SetDefaultLocalPath(nsIFile* aPath) {
  NS_ENSURE_ARG(aPath);
  return NS_SetPersistentFile(PREF_MAIL_ROOT_NNTP_REL, PREF_MAIL_ROOT_NNTP,
                              aPath);
}

NS_IMETHODIMP
nsNntpService::GetDefaultLocalPath(nsIFile** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  bool havePref;
  nsCOMPtr<nsIFile> localFile;
  nsresult rv = NS_GetPersistentFile(PREF_MAIL_ROOT_NNTP_REL,
                                     PREF_MAIL_ROOT_NNTP, NS_APP_NEWS_50_DIR,
                                     havePref, getter_AddRefs(localFile));
  if (NS_FAILED(rv)) return rv;

  bool exists;
  rv = localFile->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists)
    rv = localFile->Create(nsIFile::DIRECTORY_TYPE, 0775);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!havePref || !exists) {
    rv = NS_SetPersistentFile(PREF_MAIL_ROOT_NNTP_REL, PREF_MAIL_ROOT_NNTP,
                              localFile);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Failed to set root dir pref.");
  }

  localFile.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetServerIID(nsIID** aServerIID) {
  *aServerIID = new nsIID(NS_GET_IID(nsINntpIncomingServer));
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetRequiresUsername(bool* aRequiresUsername) {
  NS_ENSURE_ARG_POINTER(aRequiresUsername);
  *aRequiresUsername = false;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetPreflightPrettyNameWithEmailAddress(
    bool* aPreflightPrettyNameWithEmailAddress) {
  NS_ENSURE_ARG_POINTER(aPreflightPrettyNameWithEmailAddress);
  *aPreflightPrettyNameWithEmailAddress = false;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetCanLoginAtStartUp(bool* aCanLoginAtStartUp) {
  NS_ENSURE_ARG_POINTER(aCanLoginAtStartUp);
  *aCanLoginAtStartUp = true;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetCanDelete(bool* aCanDelete) {
  NS_ENSURE_ARG_POINTER(aCanDelete);
  *aCanDelete = true;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetCanDuplicate(bool* aCanDuplicate) {
  NS_ENSURE_ARG_POINTER(aCanDuplicate);
  *aCanDuplicate = true;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetCanGetMessages(bool* aCanGetMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetMessages);
  *aCanGetMessages =
      false;  // poorly named, this just means we don't have an inbox.
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetCanGetIncomingMessages(bool* aCanGetIncomingMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetIncomingMessages);
  // temporarily returns false because we don't yet support spam
  // filtering in news.  this will change.
  *aCanGetIncomingMessages = false;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetShowComposeMsgLink(bool* showComposeMsgLink) {
  NS_ENSURE_ARG_POINTER(showComposeMsgLink);
  *showComposeMsgLink = false;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetFoldersCreatedAsync(bool* aAsyncCreation) {
  NS_ENSURE_ARG_POINTER(aAsyncCreation);
  *aAsyncCreation = false;
  return NS_OK;
}

//
// rhp: Right now, this is the same as simple DisplayMessage, but it will change
// to support print rendering.
//
NS_IMETHODIMP nsNntpService::DisplayMessageForPrinting(
    const char* aMessageURI, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, nsIURI** aURL) {
  mPrintingOperation = true;
  nsresult rv = DisplayMessage(aMessageURI, aDisplayConsumer, aMsgWindow,
                               aUrlListener, nullptr, aURL);
  mPrintingOperation = false;
  return rv;
}

NS_IMETHODIMP
nsNntpService::StreamMessage(const char* aMessageURI, nsISupports* aConsumer,
                             nsIMsgWindow* aMsgWindow,
                             nsIUrlListener* aUrlListener,
                             bool /* convertData */,
                             const nsACString& aAdditionalHeader,
                             bool aLocalOnly, nsIURI** aURL) {
  // The nntp protocol object will look for "header=filter" to decide if it
  // wants to convert the data instead of using aConvertData. It turns out to be
  // way too hard to pass aConvertData all the way over to the nntp protocol
  // object.
  nsAutoCString aURIString(aMessageURI);

  if (!aAdditionalHeader.IsEmpty()) {
    aURIString.FindChar('?') == kNotFound ? aURIString += "?"
                                          : aURIString += "&";
    aURIString += "header=";
    aURIString += aAdditionalHeader;
  }

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key;
  nsresult rv =
      DecomposeNewsMessageURI(aMessageURI, getter_AddRefs(folder), &key);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString urlStr;
  rv = CreateMessageIDURL(folder, key, getter_Copies(urlStr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsNewsAction action = nsINntpUrl::ActionFetchArticle;
  if (mOpenAttachmentOperation) action = nsINntpUrl::ActionFetchPart;

  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(urlStr.get(), aUrlListener, aMsgWindow,
                        aURIString.get(), action, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  if (aLocalOnly || WeAreOffline()) {
    // Check in the offline cache, then in the mem cache
    bool hasMsgOffline = false;
    folder->HasMsgOffline(key, &hasMsgOffline);
    if (!hasMsgOffline) {
      nsCOMPtr<nsIMsgIncomingServer> server;
      rv = folder->GetServer(getter_AddRefs(server));
      NS_ENSURE_SUCCESS(rv, rv);

      int32_t socketType;
      rv = server->GetSocketType(&socketType);
      NS_ENSURE_SUCCESS(rv, rv);

      // Don't mutate/clone here.
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(url);
      rv = mailnewsurl->SetPortInternal(socketType == nsMsgSocketType::SSL
                                            ? nsINntpUrl::DEFAULT_NNTPS_PORT
                                            : nsINntpUrl::DEFAULT_NNTP_PORT);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = IsMsgInMemCache(url, folder, &hasMsgOffline);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // Return with an error if we didn't find it in the memory cache either
    if (!hasMsgOffline) return NS_ERROR_FAILURE;

    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(url, &rv));
    msgUrl->SetMsgIsInLocalCache(true);
  }

  rv = GetMessageFromUrl(url, aMsgWindow, aConsumer);
  if (aURL) url.forget(aURL);
  return rv;
}

NS_IMETHODIMP nsNntpService::StreamHeaders(const char* aMessageURI,
                                           nsIStreamListener* aConsumer,
                                           nsIUrlListener* aUrlListener,
                                           bool aLocalOnly, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aMessageURI);
  NS_ENSURE_ARG_POINTER(aConsumer);
  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key;

  nsresult rv =
      DecomposeNewsMessageURI(aMessageURI, getter_AddRefs(folder), &key);
  NS_ENSURE_SUCCESS(rv, rv);

  if (key == nsMsgKey_None) return NS_MSG_MESSAGE_NOT_FOUND;

  nsCOMPtr<nsIInputStream> inputStream;
  bool hasMsgOffline = false;
  folder->HasMsgOffline(key, &hasMsgOffline);
  if (hasMsgOffline) {
    int64_t messageOffset;
    uint32_t messageSize;
    nsresult rv = folder->GetOfflineFileStream(
        key, &messageOffset, &messageSize, getter_AddRefs(inputStream));
    NS_ENSURE_SUCCESS(rv, rv);
    return MsgStreamMsgHeaders(inputStream, aConsumer);
  }
  nsAutoCString urlStr;
  rv = CreateMessageIDURL(folder, key, getter_Copies(urlStr));
  NS_ENSURE_SUCCESS(rv, rv);

  if (aLocalOnly) return NS_ERROR_FAILURE;
  return rv;
}

NS_IMETHODIMP nsNntpService::IsMsgInMemCache(nsIURI* aUrl,
                                             nsIMsgFolder* aFolder,
                                             bool* aResult) {
  NS_ENSURE_ARG_POINTER(aUrl);
  *aResult = false;
  nsresult rv;

  if (mCacheStorage) {
    // NNTP urls are truncated at the query part when used as cache keys.
    nsAutoCString path;
    aUrl->GetPathQueryRef(path);
    int32_t pos = path.FindChar('?');
    nsCOMPtr<nsIURI> newUri;
    if (pos != kNotFound) {
      path.SetLength(pos);
      rv = NS_MutateURI(aUrl).SetPathQueryRef(path).Finalize(newUri);
      NS_ENSURE_SUCCESS(rv, rv);
    }
    bool exists;
    if (newUri)
      rv = mCacheStorage->Exists(newUri, EmptyCString(), &exists);
    else
      rv = mCacheStorage->Exists(aUrl, EmptyCString(), &exists);
    if (NS_SUCCEEDED(rv) && exists) {
      *aResult = true;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsNntpService::Search(nsIMsgSearchSession* aSearchSession,
                                    nsIMsgWindow* aMsgWindow,
                                    nsIMsgFolder* aMsgFolder,
                                    const char* aSearchUri) {
  NS_ENSURE_ARG(aMsgFolder);
  NS_ENSURE_ARG(aSearchUri);

  nsresult rv;

  nsCString searchUrl;
  rv = aMsgFolder->GetURI(searchUrl);
  NS_ENSURE_SUCCESS(rv, rv);

  searchUrl.Append(aSearchUri);

  nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(aSearchSession);
  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(searchUrl.get(), urlListener, aMsgWindow, nullptr,
                        nsINntpUrl::ActionSearch, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(url));
  if (msgurl) msgurl->SetSearchSession(aSearchSession);

  // run the url to update the counts
  return RunNewsUrl(url, nullptr, nullptr);
}

NS_IMETHODIMP
nsNntpService::GetListOfGroupsOnServer(nsINntpIncomingServer* aNntpServer,
                                       nsIMsgWindow* aMsgWindow,
                                       bool aGetOnlyNew) {
  nsresult rv;

  NS_ENSURE_ARG_POINTER(aNntpServer);

  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(aNntpServer, &rv);
  if (NS_FAILED(rv)) return rv;
  if (!server) return NS_ERROR_FAILURE;

  nsCString serverUri;
  rv = server->GetServerURI(serverUri);
  nsNewsAction newsAction;
  if (aGetOnlyNew) {
    serverUri.AppendLiteral("/?newgroups");
    newsAction = nsINntpUrl::ActionListNewGroups;
  } else {
    serverUri.AppendLiteral("/*");
    newsAction = nsINntpUrl::ActionListGroups;
  }

  nsCOMPtr<nsIUrlListener> listener = do_QueryInterface(aNntpServer, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url;
  rv = ConstructNntpUrl(serverUri.get(), listener, aMsgWindow, nullptr,
                        newsAction, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);

  // now run the url to add the rest of the groups
  return RunNewsUrl(url, aMsgWindow, nullptr);
}

NS_IMETHODIMP
nsNntpService::Handle(nsICommandLine* aCmdLine) {
  NS_ENSURE_ARG_POINTER(aCmdLine);

  nsresult rv;
  bool found;

  rv = aCmdLine->HandleFlag(u"news"_ns, false, &found);
  if (NS_SUCCEEDED(rv) && found) {
    nsCOMPtr<nsIWindowWatcher> wwatch(
        do_GetService(NS_WINDOWWATCHER_CONTRACTID));
    NS_ENSURE_TRUE(wwatch, NS_ERROR_FAILURE);

    nsCOMPtr<mozIDOMWindowProxy> opened;
    wwatch->OpenWindow(
        nullptr, "chrome://messenger/content/messenger.xhtml"_ns, "_blank"_ns,
        "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar"_ns,
        nullptr, getter_AddRefs(opened));
    aCmdLine->SetPreventDefault(true);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::GetHelpInfo(nsACString& aResult) {
  aResult.AssignLiteral("  -news              Open the news client.\n");
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::HandleContent(const char* aContentType,
                             nsIInterfaceRequestor* aWindowContext,
                             nsIRequest* request) {
  nsresult rv;
  NS_ENSURE_ARG_POINTER(request);

  nsCOMPtr<nsIChannel> aChannel = do_QueryInterface(request, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // check for x-application-newsgroup or x-application-newsgroup-listids
  if (PL_strncasecmp(aContentType, "x-application-newsgroup", 23) == 0) {
    nsCOMPtr<nsIURI> uri;
    rv = aChannel->GetURI(getter_AddRefs(uri));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(uri);
    if (mailUrl) {
      nsCOMPtr<nsIMsgFolder> msgFolder;
      rv = mailUrl->GetFolder(getter_AddRefs(msgFolder));
      NS_ENSURE_SUCCESS(rv, rv);

      // No folder means we can't handle this
      if (!msgFolder) return NS_ERROR_WONT_HANDLE_CONTENT;

      nsCString folderURL;
      rv = msgFolder->GetURI(folderURL);
      NS_ENSURE_SUCCESS(rv, rv);

      // this is all we need for listing newsgroup ids.
      if (!PL_strcasecmp(aContentType, "x-application-newsgroup-listids"))
        return NS_OK;

      nsCOMPtr<nsIMsgWindow> msgWindow;
      mailUrl->GetMsgWindow(getter_AddRefs(msgWindow));
      if (!msgWindow) {
        // This came from a docshell that didn't set msgWindow, so find one
        nsCOMPtr<nsIMsgMailSession> mailSession =
            do_GetService(NS_MSGMAILSESSION_CONTRACTID, &rv);
        NS_ENSURE_SUCCESS(rv, rv);

        mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));

        if (!msgWindow) {
          // We need to create a 3-pane window, then
          nsCOMPtr<nsIWindowWatcher> wwatcher =
              do_GetService(NS_WINDOWWATCHER_CONTRACTID, &rv);
          NS_ENSURE_SUCCESS(rv, rv);

          nsCOMPtr<nsISupportsCString> arg =
              do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID);
          arg->SetData(folderURL);

          nsCOMPtr<mozIDOMWindowProxy> newWindow;
          rv = wwatcher->OpenWindow(
              nullptr, "chrome://messenger/content/messenger.xhtml"_ns,
              "_blank"_ns, "chome,all,dialog=no"_ns, arg,
              getter_AddRefs(newWindow));
          NS_ENSURE_SUCCESS(rv, rv);
        }
      }
      if (msgWindow) {
        nsCOMPtr<nsIMsgWindowCommands> windowCommands;
        msgWindow->GetWindowCommands(getter_AddRefs(windowCommands));
        if (windowCommands) windowCommands->SelectFolder(folderURL);
      }
      request->Cancel(NS_BINDING_ABORTED);
    }
  } else  // The content-type was not x-application-newsgroup.
    rv = NS_ERROR_WONT_HANDLE_CONTENT;
  return rv;
}

NS_IMETHODIMP
nsNntpService::MessageURIToMsgHdr(const nsACString& uri,
                                  nsIMsgDBHdr** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey msgKey;

  rv = DecomposeNewsMessageURI(PromiseFlatCString(uri).get(),
                               getter_AddRefs(folder), &msgKey);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!folder) return NS_ERROR_NULL_POINTER;

  rv = folder->GetMessageHeader(msgKey, _retval);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

NS_IMETHODIMP
nsNntpService::DownloadNewsgroupsForOffline(nsIMsgWindow* aMsgWindow,
                                            nsIUrlListener* aListener) {
  RefPtr<nsMsgDownloadAllNewsgroups> newsgroupDownloader =
      new nsMsgDownloadAllNewsgroups(aMsgWindow, aListener);
  return newsgroupDownloader->ProcessNextGroup();
}

NS_IMETHODIMP nsNntpService::GetCacheStorage(nsICacheStorage** result) {
  nsresult rv = NS_OK;
  if (!mCacheStorage) {
    nsCOMPtr<nsICacheStorageService> cacheStorageService =
        do_GetService("@mozilla.org/netwerk/cache-storage-service;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    RefPtr<MailnewsLoadContextInfo> lci =
        new MailnewsLoadContextInfo(false, false, mozilla::OriginAttributes());

    rv = cacheStorageService->MemoryCacheStorage(lci,
                                                 getter_AddRefs(mCacheStorage));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  NS_IF_ADDREF(*result = mCacheStorage);
  return rv;
}

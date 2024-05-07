/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsImapService.h"
#include "nsImapCore.h"
#include "netCore.h"

#include "nsImapUrl.h"
#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgImapMailFolder.h"
#include "nsIImapIncomingServer.h"
#include "nsIImapMailFolderSink.h"
#include "nsIImapMessageSink.h"
#include "nsIImapServerSink.h"
#include "nsIImapMockChannel.h"
#include "nsImapUtils.h"
#include "nsImapNamespace.h"
#include "nsIDocShell.h"
#include "nsIProgressEventSink.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsILoadGroup.h"
#include "nsIMsgAccountManager.h"
#include "nsMsgFolderFlags.h"
#include "nsMailDirServiceDefs.h"
#include "nsIWebNavigation.h"
#include "nsImapStringBundle.h"
#include "plbase64.h"
#include "nsImapOfflineSync.h"
#include "nsIMsgHdr.h"
#include "nsMsgUtils.h"
#include "nsICacheStorage.h"
#include "nsICacheStorageService.h"
#include "nsIStreamListener.h"
#include "nsIUrlListener.h"
#include "nsNetCID.h"
#include "nsMsgI18N.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsMsgLineBuffer.h"
#include "nsIMsgParseMailMsgState.h"
#include "nsIOutputStream.h"
#include "nsIDocShell.h"
#include "nsIMessengerWindowService.h"
#include "nsIWindowMediator.h"
#include "nsIPrompt.h"
#include "nsIWindowWatcher.h"
#include "nsIMsgMailSession.h"
#include "nsIStreamConverterService.h"
#include "nsIAutoSyncManager.h"
#include "nsNetUtil.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgPluggableStore.h"
#include "../../base/src/MailnewsLoadContextInfo.h"
#include "nsDocShellLoadState.h"
#include "nsContentUtils.h"
#include "mozilla/LoadInfo.h"

#define PREF_MAIL_ROOT_IMAP_REL "mail.root.imap-rel"
// old - for backward compatibility only
#define PREF_MAIL_ROOT_IMAP "mail.root.imap"

#define NS_IMAPURL_CID                             \
  {                                                \
    0x21a89611, 0xdc0d, 0x11d2, {                  \
      0x80, 0x6c, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e \
    }                                              \
  }
static NS_DEFINE_CID(kImapUrlCID, NS_IMAPURL_CID);

#define NS_IMAPMOCKCHANNEL_CID                    \
  {                                               \
    0x4eca51df, 0x6734, 0x11d3, {                 \
      0x98, 0x9a, 0x0, 0x10, 0x83, 0x1, 0xe, 0x9b \
    }                                             \
  }
static NS_DEFINE_CID(kCImapMockChannel, NS_IMAPMOCKCHANNEL_CID);

static const char sequenceString[] = "SEQUENCE";
static const char uidString[] = "UID";

static bool gInitialized = false;

NS_IMPL_ISUPPORTS(nsImapService, nsIImapService, nsIMsgMessageService,
                  nsIProtocolHandler, nsIMsgProtocolInfo,
                  nsIMsgMessageFetchPartService, nsIContentHandler)

nsImapService::nsImapService() {
  if (!gInitialized) {
    nsresult rv;

    nsCOMPtr<nsIIOService> ioServ = do_GetIOService();
    ioServ->RegisterProtocolHandler(
        "imap"_ns, this,
        nsIProtocolHandler::URI_NORELATIVE |
            nsIProtocolHandler::URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
            nsIProtocolHandler::URI_DANGEROUS_TO_LOAD |
            nsIProtocolHandler::ALLOWS_PROXY |
            nsIProtocolHandler::URI_FORBIDS_COOKIE_ACCESS |
            nsIProtocolHandler::ORIGIN_IS_FULL_SPEC,
        nsIImapUrl::DEFAULT_IMAP_PORT);

    // initialize auto-sync service
    nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
        do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
    if (NS_SUCCEEDED(rv) && autoSyncMgr) {
      // auto-sync manager initialization goes here
      // assign new strategy objects here...
    }
    NS_ASSERTION(autoSyncMgr != nullptr,
                 "*** Cannot initialize nsAutoSyncManager service.");

    gInitialized = true;
  }
}

nsImapService::~nsImapService() {}

char nsImapService::GetHierarchyDelimiter(nsIMsgFolder* aMsgFolder) {
  char delimiter = '/';
  if (aMsgFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(aMsgFolder);
    if (imapFolder) imapFolder->GetHierarchyDelimiter(&delimiter);
  }
  return delimiter;
}

// N.B., this returns an escaped folder name, appropriate for putting in a url.
nsresult nsImapService::GetFolderName(nsIMsgFolder* aImapFolder,
                                      nsACString& aFolderName) {
  nsresult rv;
  nsCOMPtr<nsIMsgImapMailFolder> aFolder(do_QueryInterface(aImapFolder, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString onlineName;
  // Online name is in MUTF-7 or UTF-8.
  rv = aFolder->GetOnlineName(onlineName);
  NS_ENSURE_SUCCESS(rv, rv);
  if (onlineName.IsEmpty()) {
    nsCString uri;
    rv = aImapFolder->GetURI(uri);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCString hostname;
    rv = aImapFolder->GetHostname(hostname);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = nsImapURI2FullName(kImapRootURI, hostname.get(), uri.get(),
                            getter_Copies(onlineName));
  }
  // if the hierarchy delimiter is not '/', then we want to escape slashes;
  // otherwise, we do want to escape slashes.
  // we want to escape slashes and '^' first, otherwise, nsEscape will lose them
  bool escapeSlashes = (GetHierarchyDelimiter(aImapFolder) != '/');
  if (escapeSlashes && !onlineName.IsEmpty()) {
    char* escapedOnlineName;
    rv = nsImapUrl::EscapeSlashes(onlineName.get(), &escapedOnlineName);
    if (NS_SUCCEEDED(rv)) onlineName.Adopt(escapedOnlineName);
  }
  // need to escape everything else
  MsgEscapeString(onlineName, nsINetUtil::ESCAPE_URL_PATH, aFolderName);
  return rv;
}

NS_IMETHODIMP nsImapService::SelectFolder(nsIMsgFolder* aImapMailFolder,
                                          nsIUrlListener* aUrlListener,
                                          nsIMsgWindow* aMsgWindow,
                                          nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  if (WeAreOffline()) return NS_MSG_ERROR_OFFLINE;

  bool canOpenThisFolder = true;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
      do_QueryInterface(aImapMailFolder);
  if (imapFolder) imapFolder->GetCanOpenFolder(&canOpenThisFolder);

  if (!canOpenThisFolder) return NS_OK;

  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            aImapMailFolder, aUrlListener, urlSpec,
                            hierarchyDelimiter);

  if (NS_SUCCEEDED(rv) && imapUrl) {
    // nsImapUrl::SetSpec() will set the imap action properly
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapSelectFolder);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    // if no msg window, we won't put up error messages (this is almost
    // certainly a biff-inspired get new msgs)
    if (!aMsgWindow) mailNewsUrl->SetSuppressErrorMsgs(true);
    mailNewsUrl->SetMsgWindow(aMsgWindow);
    mailNewsUrl->SetUpdatingFolder(true);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsAutoCString folderName;
      GetFolderName(aImapMailFolder, folderName);
      urlSpec.AppendLiteral("/select>");
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      rv = mailNewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }  // if we have a url to run....

  return rv;
}

// lite select, used to verify UIDVALIDITY while going on/offline
NS_IMETHODIMP nsImapService::LiteSelectFolder(nsIMsgFolder* aImapMailFolder,
                                              nsIUrlListener* aUrlListener,
                                              nsIMsgWindow* aMsgWindow,
                                              nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/liteselect>",
                       nsIImapUrl::nsImapLiteSelectFolder, aMsgWindow, aURL);
}

NS_IMETHODIMP nsImapService::GetUrlForUri(const nsACString& aMessageURI,
                                          nsIMsgWindow* aMsgWindow,
                                          nsIURI** aURL) {
  nsAutoCString messageURI(aMessageURI);

  if (messageURI.Find("&type=application/x-message-display"_ns) != kNotFound)
    return NS_NewURI(aURL, aMessageURI);

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey msgKey;
  nsresult rv = DecomposeImapURI(messageURI, getter_AddRefs(folder), &msgKey);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIImapUrl> imapUrl;
    nsAutoCString urlSpec;
    char hierarchyDelimiter = GetHierarchyDelimiter(folder);
    rv = CreateStartOfImapUrl(messageURI, getter_AddRefs(imapUrl), folder,
                              nullptr, urlSpec, hierarchyDelimiter);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = SetImapUrlSink(folder, imapUrl);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(imapUrl);
    bool useLocalCache = false;
    folder->HasMsgOffline(msgKey, &useLocalCache);
    mailnewsUrl->SetMsgIsInLocalCache(useLocalCache);

    nsCOMPtr<nsIURI> url = do_QueryInterface(imapUrl);
    rv = url->GetSpec(urlSpec);
    NS_ENSURE_SUCCESS(rv, rv);
    urlSpec.AppendLiteral("fetch>UID>");
    urlSpec.Append(hierarchyDelimiter);

    nsAutoCString folderName;
    GetFolderName(folder, folderName);
    urlSpec.Append(folderName);
    urlSpec.Append('>');
    urlSpec.AppendInt(msgKey);
    rv = mailnewsUrl->SetSpecInternal(urlSpec);
    imapUrl->QueryInterface(NS_GET_IID(nsIURI), (void**)aURL);
  }

  return rv;
}

NS_IMETHODIMP nsImapService::FetchMimePart(nsIURI* aURI,
                                           const nsACString& aMessageURI,
                                           nsIStreamListener* aStreamListener,
                                           nsIMsgWindow* aMsgWindow,
                                           nsIUrlListener* aUrlListener,
                                           nsIURI** aURL) {
  nsAutoCString messageURI(aMessageURI);

  nsAutoCString folderURI;
  nsMsgKey key;
  nsAutoCString mimePart;
  nsresult rv = nsParseImapMessageURI(aMessageURI, folderURI, &key, mimePart);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgFolder> folder;
    rv = GetExistingFolder(folderURI, getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIImapMessageSink> imapMessageSink(
        do_QueryInterface(folder, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(aURI);
      nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(aURI, &rv));
      NS_ENSURE_SUCCESS(rv, rv);

      msgurl->SetMsgWindow(aMsgWindow);
      msgurl->RegisterListener(aUrlListener);

      if (!mimePart.IsEmpty()) {
        return FetchMimePartInternal(imapUrl, folder, imapMessageSink, aURL,
                                     aStreamListener, key, mimePart);
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::LoadMessage(const nsACString& aMessageURI,
                                         nsIDocShell* aDisplayConsumer,
                                         nsIMsgWindow* aMsgWindow,
                                         nsIUrlListener* aUrlListener,
                                         bool aAutodetectCharset) {
  nsresult rv;

  nsAutoCString messageURI(aMessageURI);
  nsAutoCString folderURI;
  nsMsgKey key;
  nsAutoCString mimePart;
  rv = nsParseImapMessageURI(aMessageURI, folderURI, &key, mimePart);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgFolder> folder;
    rv = GetExistingFolder(folderURI, getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIImapMessageSink> imapMessageSink(
        do_QueryInterface(folder, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImapUrl> imapUrl;
      nsAutoCString urlSpec;
      char hierarchyDelimiter = GetHierarchyDelimiter(folder);
      rv = CreateStartOfImapUrl(messageURI, getter_AddRefs(imapUrl), folder,
                                aUrlListener, urlSpec, hierarchyDelimiter);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!mimePart.IsEmpty()) {
        nsresult rv;
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

        nsAutoCString msgKey;
        msgKey.AppendInt(key);
        rv = AddImapFetchToUrl(mailnewsurl, folder, msgKey + mimePart,
                               EmptyCString());
        NS_ENSURE_SUCCESS(rv, rv);

        nsCOMPtr<nsIURI> dummyURI;
        return FetchMimePartInternal(imapUrl, folder, imapMessageSink,
                                     getter_AddRefs(dummyURI), aDisplayConsumer,
                                     key, mimePart);
      }

      nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(imapUrl));
      nsCOMPtr<nsIMsgI18NUrl> i18nurl(do_QueryInterface(imapUrl));
      i18nurl->SetAutodetectCharset(aAutodetectCharset);

      bool shouldStoreMsgOffline = false;
      bool hasMsgOffline = false;

      msgurl->SetMsgWindow(aMsgWindow);

      if (folder) {
        folder->ShouldStoreMsgOffline(key, &shouldStoreMsgOffline);
        folder->HasMsgOffline(key, &hasMsgOffline);
      }
      imapUrl->SetStoreResultsOffline(shouldStoreMsgOffline);

      if (hasMsgOffline) msgurl->SetMsgIsInLocalCache(true);

      nsCOMPtr<nsIPrefBranch> prefBranch(
          do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
      // Should the message fetch force a peek or a traditional fetch?
      // Force peek if there is a delay in marking read (or no auto-marking at
      // all). This is because a FETCH (BODY[]) will implicitly set the \Seen
      // flag on the msg, but a FETCH (BODY.PEEK[]) won't.
      bool forcePeek = false;
      if (NS_SUCCEEDED(rv) && prefBranch) {
        nsAutoCString uriStr(aMessageURI);
        int32_t dontMarkAsReadPos = uriStr.Find("&markRead=false");
        bool markReadAuto = true;
        prefBranch->GetBoolPref("mailnews.mark_message_read.auto",
                                &markReadAuto);
        bool markReadDelay = false;
        prefBranch->GetBoolPref("mailnews.mark_message_read.delay",
                                &markReadDelay);
        forcePeek = (!markReadAuto || markReadDelay ||
                     (dontMarkAsReadPos != kNotFound));
      }

      if (!forcePeek) {
        // If we're loading a message in an inactive docShell, don't let it
        auto* bc = aDisplayConsumer->GetBrowsingContext();
        forcePeek = !bc->IsActive();
      }

      nsCOMPtr<nsIURI> dummyURI;
      nsAutoCString msgKey;
      msgKey.AppendInt(key);
      rv = FetchMessage(imapUrl,
                        forcePeek ? nsIImapUrl::nsImapMsgFetchPeek
                                  : nsIImapUrl::nsImapMsgFetch,
                        folder, imapMessageSink, aMsgWindow, aDisplayConsumer,
                        msgKey, false, getter_AddRefs(dummyURI));
    }
  }
  return rv;
}

nsresult nsImapService::FetchMimePartInternal(nsIImapUrl* aImapUrl,
                                              nsIMsgFolder* aImapMailFolder,
                                              nsIImapMessageSink* aImapMessage,
                                              nsIURI** aURL,
                                              nsISupports* aDisplayConsumer,
                                              nsMsgKey msgKey,
                                              const nsACString& mimePart) {
  NS_ENSURE_ARG_POINTER(aImapUrl);
  NS_ENSURE_ARG_POINTER(aImapMailFolder);
  NS_ENSURE_ARG_POINTER(aImapMessage);
  MOZ_ASSERT(msgKey != nsMsgKey_None);

  // create a protocol instance to handle the request.
  // NOTE: once we start working with multiple connections, this step will be
  // much more complicated...but for now just create a connection and process
  // the request.
  nsAutoCString urlSpec;
  nsresult rv = SetImapUrlSink(aImapMailFolder, aImapUrl);

  nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(aImapUrl));
  if (aImapMailFolder && msgurl) {
    bool useLocalCache = false;
    rv = aImapMailFolder->HasMsgOffline(msgKey, &useLocalCache);
    NS_ENSURE_SUCCESS(rv, rv);
    msgurl->SetMsgIsInLocalCache(useLocalCache);
  }
  rv = aImapUrl->SetImapMessageSink(aImapMessage);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIURI> url = do_QueryInterface(aImapUrl);
    if (aURL) NS_IF_ADDREF(*aURL = url);

    rv = url->GetSpec(urlSpec);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = msgurl->SetSpecInternal(urlSpec);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = aImapUrl->SetImapAction(nsIImapUrl::nsImapMsgFetch);
    if (aImapMailFolder && aDisplayConsumer) {
      nsCOMPtr<nsIMsgIncomingServer> aMsgIncomingServer;
      rv = aImapMailFolder->GetServer(getter_AddRefs(aMsgIncomingServer));
      if (NS_SUCCEEDED(rv) && aMsgIncomingServer) {
        bool interrupted;
        nsCOMPtr<nsIImapIncomingServer> aImapServer(
            do_QueryInterface(aMsgIncomingServer, &rv));
        if (NS_SUCCEEDED(rv) && aImapServer)
          aImapServer->PseudoInterruptMsgLoad(aImapMailFolder, nullptr,
                                              &interrupted);
      }
    }
    // if the display consumer is a docshell, then we should run the url in the
    // docshell. otherwise, it should be a stream listener....so open a channel
    // using AsyncRead and the provided stream listener....

    nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
    if (NS_SUCCEEDED(rv) && docShell) {
      // DIRTY LITTLE HACK --> if we are opening an attachment we want the
      // docshell to treat this load as if it were a user click event. Then the
      // dispatching stuff will be much happier.
      RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(url);
      loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_NONE);
      loadState->SetFirstParty(false);
      loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
      rv = docShell->LoadURI(loadState, false);
    } else {
      nsCOMPtr<nsIStreamListener> aStreamListener =
          do_QueryInterface(aDisplayConsumer, &rv);
      if (NS_SUCCEEDED(rv) && aStreamListener) {
        nsCOMPtr<nsIChannel> aChannel;
        nsCOMPtr<nsILoadGroup> loadGroup;
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
            do_QueryInterface(aImapUrl, &rv);
        if (NS_SUCCEEDED(rv) && mailnewsUrl)
          mailnewsUrl->GetLoadGroup(getter_AddRefs(loadGroup));

        nsCOMPtr<nsILoadInfo> loadInfo = new mozilla::net::LoadInfo(
            nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
            nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
            nsIContentPolicy::TYPE_OTHER);
        rv = NewChannel(url, loadInfo, getter_AddRefs(aChannel));
        NS_ENSURE_SUCCESS(rv, rv);

        // we need a load group to hold onto the channel. When the request is
        // finished, it'll get removed from the load group, and the channel will
        // go away, which will free the load group.
        if (!loadGroup) loadGroup = do_CreateInstance(NS_LOADGROUP_CONTRACTID);

        aChannel->SetLoadGroup(loadGroup);

        //  now try to open the channel passing in our display consumer as the
        //  listener
        rv = aChannel->AsyncOpen(aStreamListener);
      } else  // do what we used to do before
      {
        // I'd like to get rid of this code as I believe that we always get a
        // docshell or stream listener passed into us in this method but i'm not
        // sure yet... I'm going to use an assert for now to figure out if this
        // is ever getting called
#if defined(DEBUG_mscott) || defined(DEBUG_bienvenu)
        NS_ERROR("oops...someone still is reaching this part of the code");
#endif
        rv = GetImapConnectionAndLoadUrl(aImapUrl, aDisplayConsumer, aURL);
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::CopyMessage(const nsACString& aSrcMailboxURI,
                                         nsIStreamListener* aMailboxCopy,
                                         bool moveMessage,
                                         nsIUrlListener* aUrlListener,
                                         nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aMailboxCopy);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey key;
  rv = DecomposeImapURI(aSrcMailboxURI, getter_AddRefs(folder), &key);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIImapMessageSink> imapMessageSink(
        do_QueryInterface(folder, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImapUrl> imapUrl;
      nsAutoCString urlSpec;
      char hierarchyDelimiter = GetHierarchyDelimiter(folder);
      bool hasMsgOffline = false;

      rv = CreateStartOfImapUrl(aSrcMailboxURI, getter_AddRefs(imapUrl), folder,
                                aUrlListener, urlSpec, hierarchyDelimiter);
      if (folder) {
        nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(imapUrl));
        folder->HasMsgOffline(key, &hasMsgOffline);
        if (msgurl) msgurl->SetMsgIsInLocalCache(hasMsgOffline);
      }
      // now try to download the message
      nsImapAction imapAction = nsIImapUrl::nsImapOnlineToOfflineCopy;
      if (moveMessage) imapAction = nsIImapUrl::nsImapOnlineToOfflineMove;
      nsCOMPtr<nsIURI> dummyURI;
      nsAutoCString msgKey;
      msgKey.AppendInt(key);
      rv =
          FetchMessage(imapUrl, imapAction, folder, imapMessageSink, aMsgWindow,
                       aMailboxCopy, msgKey, false, getter_AddRefs(dummyURI));
    }  // if we got an imap message sink
  }    // if we decomposed the imap message
  return rv;
}

NS_IMETHODIMP nsImapService::CopyMessages(
    const nsTArray<nsMsgKey>& aKeys, nsIMsgFolder* srcFolder,
    nsIStreamListener* aMailboxCopy, bool moveMessage,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aMailboxCopy);
  NS_ENSURE_TRUE(!aKeys.IsEmpty(), NS_ERROR_INVALID_ARG);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> folder = srcFolder;
  nsCOMPtr<nsIImapMessageSink> imapMessageSink(do_QueryInterface(folder, &rv));
  if (NS_SUCCEEDED(rv)) {
    // we generate the uri for the first message so that way on down the line,
    // GetMessage in nsCopyMessageStreamListener will get an unescaped
    // username and be able to find the msg hdr. See bug 259656 for details
    nsCString uri;
    srcFolder->GenerateMessageURI(aKeys[0], uri);

    nsCString messageIds;
    // TODO: AllocateImapUidString() maxes out at 950 keys or so... it
    // updates the numKeys passed in, but here the resulting value is
    // ignored. Does this need sorting out?
    uint32_t numKeys = aKeys.Length();
    AllocateImapUidString(aKeys.Elements(), numKeys, nullptr, messageIds);
    nsCOMPtr<nsIImapUrl> imapUrl;
    nsAutoCString urlSpec;
    char hierarchyDelimiter = GetHierarchyDelimiter(folder);
    rv = CreateStartOfImapUrl(uri, getter_AddRefs(imapUrl), folder,
                              aUrlListener, urlSpec, hierarchyDelimiter);
    nsImapAction action;
    if (moveMessage)  // don't use ?: syntax here, it seems to break the Mac.
      action = nsIImapUrl::nsImapOnlineToOfflineMove;
    else
      action = nsIImapUrl::nsImapOnlineToOfflineCopy;
    imapUrl->SetCopyState(aMailboxCopy);
    // now try to display the message
    rv = FetchMessage(imapUrl, action, folder, imapMessageSink, aMsgWindow,
                      aMailboxCopy, messageIds, false, aURL);
    // ### end of copy operation should know how to do the delete.if this is a
    // move

  }  // if we got an imap message sink
  return rv;
}

NS_IMETHODIMP nsImapService::Search(nsIMsgSearchSession* aSearchSession,
                                    nsIMsgWindow* aMsgWindow,
                                    nsIMsgFolder* aMsgFolder,
                                    const nsACString& aSearchUri) {
  NS_ENSURE_ARG_POINTER(aMsgFolder);
  nsresult rv;

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(aSearchSession, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString urlSpec;
  char hierarchyDelimiter = GetHierarchyDelimiter(aMsgFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), aMsgFolder,
                            urlListener, urlSpec, hierarchyDelimiter);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(imapUrl));

  msgurl->SetMsgWindow(aMsgWindow);
  msgurl->SetSearchSession(aSearchSession);
  rv = SetImapUrlSink(aMsgFolder, imapUrl);

  if (NS_SUCCEEDED(rv)) {
    nsCString folderName;
    GetFolderName(aMsgFolder, folderName);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    if (!aMsgWindow) mailNewsUrl->SetSuppressErrorMsgs(true);

    urlSpec.AppendLiteral("/search>UID>");
    urlSpec.Append(hierarchyDelimiter);
    urlSpec.Append(folderName);
    urlSpec.Append('>');
    // escape aSearchUri so that IMAP special characters (i.e. '\')
    // won't be replaced with '/' in NECKO.
    // it will be unescaped in nsImapUrl::ParseUrl().
    nsCString escapedSearchUri;

    MsgEscapeString(aSearchUri, nsINetUtil::ESCAPE_XALPHAS, escapedSearchUri);
    urlSpec.Append(escapedSearchUri);
    rv = mailNewsUrl->SetSpecInternal(urlSpec);
    if (NS_SUCCEEDED(rv))
      rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
  }
  return rv;
}

// just a helper method to break down imap message URIs....
nsresult nsImapService::DecomposeImapURI(const nsACString& aMessageURI,
                                         nsIMsgFolder** aFolder,
                                         nsMsgKey* aMsgKey) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aMsgKey);

  nsAutoCString folderURI;
  nsAutoCString mimePart;
  nsresult rv =
      nsParseImapMessageURI(aMessageURI, folderURI, aMsgKey, mimePart);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetOrCreateFolder(folderURI, aFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP nsImapService::SaveMessageToDisk(const nsACString& aMessageURI,
                                               nsIFile* aFile,
                                               bool aAddDummyEnvelope,
                                               nsIUrlListener* aUrlListener,
                                               bool canonicalLineEnding,
                                               nsIMsgWindow* aMsgWindow) {
  nsCOMPtr<nsIMsgFolder> folder;
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsMsgKey msgKey;

  nsresult rv = DecomposeImapURI(aMessageURI, getter_AddRefs(folder), &msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasMsgOffline = false;

  if (folder) folder->HasMsgOffline(msgKey, &hasMsgOffline);

  nsAutoCString urlSpec;
  char hierarchyDelimiter = GetHierarchyDelimiter(folder);
  rv = CreateStartOfImapUrl(aMessageURI, getter_AddRefs(imapUrl), folder,
                            aUrlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIImapMessageSink> imapMessageSink(
        do_QueryInterface(folder, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(imapUrl, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    msgUrl->SetMessageFile(aFile);
    msgUrl->SetAddDummyEnvelope(aAddDummyEnvelope);
    msgUrl->SetCanonicalLineEnding(canonicalLineEnding);

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(msgUrl);
    if (mailnewsUrl) mailnewsUrl->SetMsgIsInLocalCache(hasMsgOffline);

    nsCOMPtr<nsIStreamListener> saveAsListener;
    mailnewsUrl->GetSaveAsListener(aAddDummyEnvelope, aFile,
                                   getter_AddRefs(saveAsListener));

    // IMAP code uses UID as msgkey.
    nsAutoCString uid;
    uid.AppendInt(msgKey);
    nsCOMPtr<nsIURI> dummyNull;
    return FetchMessage(imapUrl, nsIImapUrl::nsImapSaveMessageToDisk, folder,
                        imapMessageSink, aMsgWindow, saveAsListener, uid, false,
                        getter_AddRefs(dummyNull));
  }
  return rv;
}

/* fetching RFC822 messages */
/* imap4://HOST>fetch>UID>MAILBOXPATH>x */
/*   'x' is the message UID */
/* will set the 'SEEN' flag */
nsresult nsImapService::AddImapFetchToUrl(
    nsIMsgMailNewsUrl* aUrl, nsIMsgFolder* aImapMailFolder,
    const nsACString& aMessageIdentifierList,
    const nsACString& aAdditionalHeader) {
  NS_ENSURE_ARG_POINTER(aUrl);

  nsAutoCString urlSpec;
  nsresult rv = aUrl->GetSpec(urlSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);

  urlSpec.AppendLiteral("fetch>UID>");
  urlSpec.Append(hierarchyDelimiter);

  nsAutoCString folderName;
  GetFolderName(aImapMailFolder, folderName);
  urlSpec.Append(folderName);

  urlSpec.Append('>');
  urlSpec.Append(aMessageIdentifierList);

  if (!aAdditionalHeader.IsEmpty()) {
    urlSpec.AppendLiteral("?header=");
    urlSpec.Append(aAdditionalHeader);
  }

  return aUrl->SetSpecInternal(urlSpec);
}

nsresult nsImapService::FetchMessage(nsIImapUrl* aImapUrl,
                                     nsImapAction aImapAction,
                                     nsIMsgFolder* aImapMailFolder,
                                     nsIImapMessageSink* aImapMessage,
                                     nsIMsgWindow* aMsgWindow,
                                     nsISupports* aDisplayConsumer,
                                     const nsACString& messageIdentifierList,
                                     bool aConvertDataToText, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapUrl);
  NS_ENSURE_ARG_POINTER(aImapMailFolder);
  NS_ENSURE_ARG_POINTER(aImapMessage);

  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(aImapUrl);

  rv = AddImapFetchToUrl(mailnewsurl, aImapMailFolder, messageIdentifierList,
                         ""_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  if (WeAreOffline()) {
    bool msgIsInCache = false;
    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(aImapUrl));
    msgUrl->GetMsgIsInLocalCache(&msgIsInCache);
    if (!msgIsInCache)
      IsMsgInMemCache(mailnewsurl, aImapMailFolder, &msgIsInCache);

    // Display the "offline" message if we didn't find it in the memory cache
    // either
    if (!msgIsInCache) {
      return NS_ERROR_OFFLINE;
    }
  }

  if (aURL) mailnewsurl.forget(aURL);

  return GetMessageFromUrl(aImapUrl, aImapAction, aImapMailFolder, aImapMessage,
                           aMsgWindow, aDisplayConsumer, aConvertDataToText,
                           aURL);
}

nsresult nsImapService::GetMessageFromUrl(
    nsIImapUrl* aImapUrl, nsImapAction aImapAction,
    nsIMsgFolder* aImapMailFolder, nsIImapMessageSink* aImapMessage,
    nsIMsgWindow* aMsgWindow, nsISupports* aDisplayConsumer,
    bool aConvertDataToText, nsIURI** aURL) {
  nsresult rv = SetImapUrlSink(aImapMailFolder, aImapUrl);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aImapUrl->SetImapMessageSink(aImapMessage);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aImapUrl->SetImapAction(aImapAction);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url(do_QueryInterface(aImapUrl));

  // if the display consumer is a docshell, then we should run the url in the
  // docshell. otherwise, it should be a stream listener....so open a channel
  // using AsyncRead and the provided stream listener....

  nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
  if (aImapMailFolder && docShell) {
    nsCOMPtr<nsIMsgIncomingServer> aMsgIncomingServer;
    rv = aImapMailFolder->GetServer(getter_AddRefs(aMsgIncomingServer));
    if (NS_SUCCEEDED(rv) && aMsgIncomingServer) {
      bool interrupted;
      nsCOMPtr<nsIImapIncomingServer> aImapServer(
          do_QueryInterface(aMsgIncomingServer, &rv));
      if (NS_SUCCEEDED(rv) && aImapServer)
        aImapServer->PseudoInterruptMsgLoad(aImapMailFolder, aMsgWindow,
                                            &interrupted);
    }
  }
  if (NS_SUCCEEDED(rv) && docShell) {
    NS_ASSERTION(!aConvertDataToText,
                 "can't convert to text when using docshell");
    RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(url);
    loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_NONE);
    loadState->SetFirstParty(false);
    loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
    rv = docShell->LoadURI(loadState, false);
  } else {
    nsCOMPtr<nsIStreamListener> streamListener =
        do_QueryInterface(aDisplayConsumer, &rv);
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aImapUrl, &rv);
    if (aMsgWindow && mailnewsUrl) mailnewsUrl->SetMsgWindow(aMsgWindow);
    if (NS_SUCCEEDED(rv) && streamListener) {
      nsCOMPtr<nsIChannel> channel;
      nsCOMPtr<nsILoadGroup> loadGroup;
      if (NS_SUCCEEDED(rv) && mailnewsUrl)
        mailnewsUrl->GetLoadGroup(getter_AddRefs(loadGroup));

      nsCOMPtr<nsILoadInfo> loadInfo = new mozilla::net::LoadInfo(
          nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
          nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
          nsIContentPolicy::TYPE_OTHER);
      rv = NewChannel(url, loadInfo, getter_AddRefs(channel));
      NS_ENSURE_SUCCESS(rv, rv);

      // we need a load group to hold onto the channel. When the request is
      // finished, it'll get removed from the load group, and the channel will
      // go away, which will free the load group.
      if (!loadGroup) loadGroup = do_CreateInstance(NS_LOADGROUP_CONTRACTID);

      rv = channel->SetLoadGroup(loadGroup);
      NS_ENSURE_SUCCESS(rv, rv);

      if (aConvertDataToText) {
        nsCOMPtr<nsIStreamListener> conversionListener;
        nsCOMPtr<nsIStreamConverterService> streamConverter =
            do_GetService("@mozilla.org/streamConverters;1", &rv);
        NS_ENSURE_SUCCESS(rv, rv);
        rv = streamConverter->AsyncConvertData(
            "message/rfc822", "*/*", streamListener, channel,
            getter_AddRefs(conversionListener));
        NS_ENSURE_SUCCESS(rv, rv);
        streamListener = conversionListener;  // this is our new listener.
      }

      //  now try to open the channel passing in our display consumer as the
      //  listener
      rv = channel->AsyncOpen(streamListener);
    } else  // do what we used to do before
    {
      // I'd like to get rid of this code as I believe that we always get a
      // docshell or stream listener passed into us in this method but i'm not
      // sure yet... I'm going to use an assert for now to figure out if this is
      // ever getting called
#if defined(DEBUG_mscott) || defined(DEBUG_bienvenu)
      NS_ERROR("oops...someone still is reaching this part of the code");
#endif
      rv = GetImapConnectionAndLoadUrl(aImapUrl, aDisplayConsumer, aURL);
    }
  }
  return rv;
}

// this method streams a message to the passed in consumer, with an optional
// stream converter and additional header (e.g., "header=filter")
NS_IMETHODIMP nsImapService::StreamMessage(
    const nsACString& aMessageURI, nsIStreamListener* aStreamListener,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, bool aConvertData,
    const nsACString& aAdditionalHeader, bool aLocalOnly, nsIURI** aURL) {
  nsAutoCString messageURI(aMessageURI);

  int32_t typeIndex = messageURI.Find("&type=application/x-message-display");
  if (typeIndex != kNotFound) {
    // This happens with forward inline of a message/rfc822 attachment opened in
    // a standalone msg window.
    // So, just cut to the chase and call AsyncOpen on a channel.
    nsCOMPtr<nsIURI> uri;
    messageURI.Cut(typeIndex,
                   sizeof("&type=application/x-message-display") - 1);
    nsresult rv = NS_NewURI(getter_AddRefs(uri), messageURI.get());
    NS_ENSURE_SUCCESS(rv, rv);
    if (aURL) NS_IF_ADDREF(*aURL = uri);

    nsCOMPtr<nsIChannel> aChannel;
    nsCOMPtr<nsILoadGroup> aLoadGroup;
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(uri, &rv);
    if (NS_SUCCEEDED(rv) && mailnewsUrl)
      mailnewsUrl->GetLoadGroup(getter_AddRefs(aLoadGroup));

    nsCOMPtr<nsILoadInfo> loadInfo = new mozilla::net::LoadInfo(
        nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
        nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        nsIContentPolicy::TYPE_OTHER);
    rv = NewChannel(uri, loadInfo, getter_AddRefs(aChannel));
    NS_ENSURE_SUCCESS(rv, rv);

    //  now try to open the channel passing in our display consumer as the
    //  listener
    rv = aChannel->AsyncOpen(aStreamListener);
    return rv;
  }

  nsAutoCString folderURI;
  nsMsgKey key;
  nsAutoCString mimePart;
  nsresult rv = nsParseImapMessageURI(aMessageURI, folderURI, &key, mimePart);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetExistingFolder(folderURI, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapMessageSink> imapMessageSink(do_QueryInterface(folder, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  char hierarchyDelimiter = GetHierarchyDelimiter(folder);
  rv = CreateStartOfImapUrl(aMessageURI, getter_AddRefs(imapUrl), folder,
                            aUrlListener, urlSpec, hierarchyDelimiter);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl(do_QueryInterface(imapUrl));

  // This option is used by the JS Mime Emitter, in case we want a cheap
  // streaming, for example, if we just want a quick look at some header,
  // without having to download all the attachments...

  // We need to add the fetch command here for the cache lookup to behave
  // correctly
  nsAutoCString additionalHeader(aAdditionalHeader);
  nsAutoCString msgKey;
  msgKey.AppendInt(key);
  rv = AddImapFetchToUrl(mailnewsurl, folder, msgKey, additionalHeader);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> aMsgIncomingServer;

  mailnewsurl->SetMsgWindow(aMsgWindow);
  rv = mailnewsurl->GetServer(getter_AddRefs(aMsgIncomingServer));

  // Try to check if the message is offline
  bool hasMsgOffline = false;
  folder->HasMsgOffline(key, &hasMsgOffline);
  mailnewsurl->SetMsgIsInLocalCache(hasMsgOffline);
  imapUrl->SetLocalFetchOnly(aLocalOnly);

  // If we don't have the message available locally, and we can't get it
  // over the network, return with an error
  if (aLocalOnly || WeAreOffline()) {
    bool isMsgInMemCache = false;
    if (!hasMsgOffline) {
      rv = IsMsgInMemCache(mailnewsurl, folder, &isMsgInMemCache);
      NS_ENSURE_SUCCESS(rv, rv);

      if (!isMsgInMemCache) return NS_ERROR_FAILURE;
    }
  }

  bool shouldStoreMsgOffline = false;
  folder->ShouldStoreMsgOffline(key, &shouldStoreMsgOffline);
  imapUrl->SetStoreResultsOffline(shouldStoreMsgOffline);
  rv = GetMessageFromUrl(imapUrl, nsIImapUrl::nsImapMsgFetchPeek, folder,
                         imapMessageSink, aMsgWindow, aStreamListener,
                         aConvertData, aURL);
  return rv;
}

// this method streams a message's headers to the passed in consumer.
NS_IMETHODIMP nsImapService::StreamHeaders(const nsACString& aMessageURI,
                                           nsIStreamListener* aConsumer,
                                           nsIUrlListener* aUrlListener,
                                           bool aLocalOnly, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aConsumer);

  nsAutoCString folderURI;
  nsMsgKey key;
  nsAutoCString mimePart;  // Unused.
  nsresult rv = nsParseImapMessageURI(aMessageURI, folderURI, &key, mimePart);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetExistingFolder(folderURI, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIInputStream> inputStream;
  bool hasMsgOffline = false;
  folder->HasMsgOffline(key, &hasMsgOffline);
  if (hasMsgOffline) {
    nsCOMPtr<nsIMsgDBHdr> hdr;
    rv = folder->GetMessageHeader(key, getter_AddRefs(hdr));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = folder->GetLocalMsgStream(hdr, getter_AddRefs(inputStream));
    NS_ENSURE_SUCCESS(rv, rv);
    return MsgStreamMsgHeaders(inputStream, aConsumer);
  }

  if (aLocalOnly) return NS_ERROR_FAILURE;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::IsMsgInMemCache(nsIURI* aUrl,
                                             nsIMsgFolder* aImapMailFolder,
                                             bool* aResult) {
  NS_ENSURE_ARG_POINTER(aUrl);
  NS_ENSURE_ARG_POINTER(aImapMailFolder);
  *aResult = false;

  // Poke around in the memory cache
  if (mCacheStorage) {
    nsAutoCString urlSpec;
    aUrl->GetSpec(urlSpec);

    // Strip any query qualifiers.
    bool truncated = false;
    int32_t ind = urlSpec.FindChar('?');
    if (ind != kNotFound) {
      urlSpec.SetLength(ind);
      truncated = true;
    }
    ind = urlSpec.Find("/;");
    if (ind != kNotFound) {
      urlSpec.SetLength(ind);
      truncated = true;
    }

    nsresult rv;
    nsCOMPtr<nsIImapMailFolderSink> folderSink(
        do_QueryInterface(aImapMailFolder, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    int32_t uidValidity = -1;
    folderSink->GetUidValidity(&uidValidity);
    // stick the uid validity in front of the url, so that if the uid validity
    // changes, we won't re-use the wrong cache entries.
    nsAutoCString extension;
    extension.AppendInt(uidValidity, 16);

    bool exists;
    if (truncated) {
      nsCOMPtr<nsIURI> newUri;
      rv = NS_NewURI(getter_AddRefs(newUri), urlSpec);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = mCacheStorage->Exists(newUri, extension, &exists);
    } else {
      rv = mCacheStorage->Exists(aUrl, extension, &exists);
    }
    if (NS_SUCCEEDED(rv) && exists) {
      *aResult = true;
    }
  }

  return NS_OK;
}

nsresult nsImapService::CreateStartOfImapUrl(const nsACString& aImapURI,
                                             nsIImapUrl** imapUrl,
                                             nsIMsgFolder* aImapMailFolder,
                                             nsIUrlListener* aUrlListener,
                                             nsACString& urlSpec,
                                             char& hierarchyDelimiter) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsCString hostname;
  nsCString username;
  nsCString escapedUsername;

  nsresult rv = aImapMailFolder->GetHostname(hostname);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = aImapMailFolder->GetUsername(username);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!username.IsEmpty())
    MsgEscapeString(username, nsINetUtil::ESCAPE_XALPHAS, escapedUsername);

  int32_t port = nsIImapUrl::DEFAULT_IMAP_PORT;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = aImapMailFolder->GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv)) {
    server->GetPort(&port);
    if (port == -1 || port == 0) port = nsIImapUrl::DEFAULT_IMAP_PORT;
  }

  // now we need to create an imap url to load into the connection. The url
  // needs to represent a select folder action.
  rv = CallCreateInstance(kImapUrlCID, imapUrl);
  if (NS_SUCCEEDED(rv) && *imapUrl) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(*imapUrl, &rv);
    if (NS_SUCCEEDED(rv) && mailnewsUrl && aUrlListener)
      mailnewsUrl->RegisterListener(aUrlListener);
    nsCOMPtr<nsIMsgMessageUrl> msgurl(do_QueryInterface(*imapUrl));
    (*imapUrl)->SetExternalLinkUrl(false);
    msgurl->SetUri(aImapURI);

    urlSpec = "imap://";
    urlSpec.Append(escapedUsername);
    urlSpec.Append('@');
    urlSpec.Append(hostname);
    urlSpec.Append(':');

    nsAutoCString portStr;
    portStr.AppendInt(port);
    urlSpec.Append(portStr);

    // *** jefft - force to parse the urlSpec in order to search for
    // the correct incoming server
    rv = mailnewsUrl->SetSpecInternal(urlSpec);
    NS_ENSURE_SUCCESS(rv, rv);

    hierarchyDelimiter = kOnlineHierarchySeparatorUnknown;
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
        do_QueryInterface(aImapMailFolder);
    if (imapFolder) imapFolder->GetHierarchyDelimiter(&hierarchyDelimiter);
  }
  return rv;
}

/* fetching the headers of RFC822 messages */
/* imap4://HOST>header><UID/SEQUENCE>>MAILBOXPATH>x */
/*   'x' is the message UID or sequence number list */
/* will not affect the 'SEEN' flag */
NS_IMETHODIMP nsImapService::GetHeaders(nsIMsgFolder* aImapMailFolder,
                                        nsIUrlListener* aUrlListener,
                                        nsIURI** aURL,
                                        const nsACString& messageIdentifierList,
                                        bool messageIdsAreUID) {
  // create a protocol instance to handle the request.
  // NOTE: once we start working with multiple connections, this step will be
  // much more complicated...but for now just create a connection and process
  // the request.
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);

  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(imapUrl);

    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapMsgFetch);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      urlSpec.AppendLiteral("/header>");
      urlSpec.Append(messageIdsAreUID ? uidString : sequenceString);
      urlSpec.Append('>');
      urlSpec.Append(char(hierarchyDelimiter));

      nsCString folderName;

      GetFolderName(aImapMailFolder, folderName);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(messageIdentifierList);
      rv = mailnewsUrl->SetSpecInternal(urlSpec);

      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }
  return rv;
}

/* peeking at the start of msg bodies */
/* imap4://HOST>header><UID>>MAILBOXPATH>x>n */
/*   'x' is the message UID */
/*   'n' is the number of bytes to fetch */
/* will not affect the 'SEEN' flag */
NS_IMETHODIMP nsImapService::GetBodyStart(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener,
    const nsACString& messageIdentifierList, int32_t numBytes, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            aImapMailFolder, aUrlListener, urlSpec,
                            hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapMsgPreview);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(imapUrl);

      urlSpec.AppendLiteral("/previewBody>");
      urlSpec.Append(uidString);
      urlSpec.Append('>');
      urlSpec.Append(hierarchyDelimiter);

      nsCString folderName;
      GetFolderName(aImapMailFolder, folderName);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(messageIdentifierList);
      urlSpec.Append('>');
      urlSpec.AppendInt(numBytes);
      rv = mailnewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }
  return rv;
}

nsresult nsImapService::FolderCommand(nsIMsgFolder* imapMailFolder,
                                      nsIUrlListener* urlListener,
                                      const char* aCommand,
                                      nsImapAction imapAction,
                                      nsIMsgWindow* msgWindow, nsIURI** url) {
  NS_ENSURE_ARG_POINTER(imapMailFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(imapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     imapMailFolder, urlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = imapUrl->SetImapAction(imapAction);
    rv = SetImapUrlSink(imapMailFolder, imapUrl);
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);
    if (mailnewsurl) mailnewsurl->SetMsgWindow(msgWindow);

    if (NS_SUCCEEDED(rv)) {
      urlSpec.Append(aCommand);
      urlSpec.Append(hierarchyDelimiter);

      nsCString folderName;
      GetFolderName(imapMailFolder, folderName);
      urlSpec.Append(folderName);
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, url);
    }
  }
  return rv;
}

NS_IMETHODIMP
nsImapService::VerifyLogon(nsIMsgFolder* aFolder, nsIUrlListener* aUrlListener,
                           nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char delimiter = '/';  // shouldn't matter what is is.
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     aFolder, aUrlListener, urlSpec, delimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    mailNewsUrl->SetSuppressErrorMsgs(true);
    mailNewsUrl->SetMsgWindow(aMsgWindow);
    rv = SetImapUrlSink(aFolder, imapUrl);
    urlSpec.AppendLiteral("/verifyLogon");
    rv = mailnewsurl->SetSpecInternal(urlSpec);
    if (NS_SUCCEEDED(rv))
      rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
    if (aURL) mailnewsurl.forget(aURL);
  }
  return rv;
}

// Noop, used to update a folder (causes server to send changes).
NS_IMETHODIMP nsImapService::Noop(nsIMsgFolder* aImapMailFolder,
                                  nsIUrlListener* aUrlListener, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/selectnoop>",
                       nsIImapUrl::nsImapSelectNoopFolder, nullptr, aURL);
}

// FolderStatus, used to update message counts
NS_IMETHODIMP nsImapService::UpdateFolderStatus(nsIMsgFolder* aImapMailFolder,
                                                nsIUrlListener* aUrlListener,
                                                nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/folderstatus>",
                       nsIImapUrl::nsImapFolderStatus, nullptr, aURL);
}

// Expunge, used to "compress" an imap folder,removes deleted messages.
NS_IMETHODIMP nsImapService::Expunge(nsIMsgFolder* aImapMailFolder,
                                     nsIUrlListener* aUrlListener,
                                     nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/Expunge>",
                       nsIImapUrl::nsImapExpungeFolder, aMsgWindow, nullptr);
}

/* old-stle biff that doesn't download headers */
NS_IMETHODIMP nsImapService::Biff(nsIMsgFolder* aImapMailFolder,
                                  nsIUrlListener* aUrlListener, nsIURI** aURL,
                                  uint32_t uidHighWater) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  // static const char *formatString = "biff>%c%s>%ld";
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapExpungeFolder);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);
    if (NS_SUCCEEDED(rv)) {
      urlSpec.AppendLiteral("/Biff>");
      urlSpec.Append(hierarchyDelimiter);

      nsCString folderName;
      GetFolderName(aImapMailFolder, folderName);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.AppendInt(uidHighWater);
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::DeleteFolder(nsIMsgFolder* aImapMailFolder,
                                          nsIUrlListener* aUrlListener,
                                          nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/delete>",
                       nsIImapUrl::nsImapDeleteFolder, aMsgWindow, nullptr);
}

NS_IMETHODIMP nsImapService::DeleteMessages(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener, nsIURI** aURL,
    const nsACString& messageIdentifierList, bool messageIdsAreUID) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  // create a protocol instance to handle the request.
  // NOTE: once we start working with multiple connections, this step will be
  // much more complicated...but for now just create a connection and process
  // the request.
  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            aImapMailFolder, aUrlListener, urlSpec,
                            hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapMsgFetch);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

      urlSpec.AppendLiteral("/deletemsg>");
      urlSpec.Append(messageIdsAreUID ? uidString : sequenceString);
      urlSpec.Append('>');
      urlSpec.Append(hierarchyDelimiter);

      nsCString folderName;
      GetFolderName(aImapMailFolder, folderName);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(messageIdentifierList);
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }
  return rv;
}

// Delete all messages in a folder, used to empty trash
NS_IMETHODIMP nsImapService::DeleteAllMessages(nsIMsgFolder* aImapMailFolder,
                                               nsIUrlListener* aUrlListener) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/deleteallmsgs>",
                       nsIImapUrl::nsImapSelectNoopFolder, nullptr, nullptr);
}

NS_IMETHODIMP nsImapService::AddMessageFlags(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener,
    const nsACString& messageIdentifierList, imapMessageFlagsType flags,
    bool messageIdsAreUID) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return DiddleFlags(aImapMailFolder, aUrlListener, nullptr,
                     messageIdentifierList, "addmsgflags", flags,
                     messageIdsAreUID);
}

NS_IMETHODIMP nsImapService::SubtractMessageFlags(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener,
    const nsACString& messageIdentifierList, imapMessageFlagsType flags,
    bool messageIdsAreUID) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return DiddleFlags(aImapMailFolder, aUrlListener, nullptr,
                     messageIdentifierList, "subtractmsgflags", flags,
                     messageIdsAreUID);
}

NS_IMETHODIMP nsImapService::SetMessageFlags(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener, nsIURI** aURL,
    const nsACString& messageIdentifierList, imapMessageFlagsType flags,
    bool messageIdsAreUID) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return DiddleFlags(aImapMailFolder, aUrlListener, aURL, messageIdentifierList,
                     "setmsgflags", flags, messageIdsAreUID);
}

nsresult nsImapService::DiddleFlags(nsIMsgFolder* aImapMailFolder,
                                    nsIUrlListener* aUrlListener, nsIURI** aURL,
                                    const nsACString& messageIdentifierList,
                                    const char* howToDiddle,
                                    imapMessageFlagsType flags,
                                    bool messageIdsAreUID) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  // create a protocol instance to handle the request.
  // NOTE: once we start working with multiple connections,
  //       this step will be much more complicated...but for now
  // just create a connection and process the request.
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapMsgFetch);
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

      urlSpec.Append('/');
      urlSpec.Append(howToDiddle);
      urlSpec.Append('>');
      urlSpec.Append(messageIdsAreUID ? uidString : sequenceString);
      urlSpec.Append('>');
      urlSpec.Append(hierarchyDelimiter);
      nsCString folderName;
      GetFolderName(aImapMailFolder, folderName);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(messageIdentifierList);
      urlSpec.Append('>');
      urlSpec.AppendInt(flags);
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }
  return rv;
}

nsresult nsImapService::SetImapUrlSink(nsIMsgFolder* aMsgFolder,
                                       nsIImapUrl* aImapUrl) {
  NS_ENSURE_ARG_POINTER(aMsgFolder);
  NS_ENSURE_ARG_POINTER(aImapUrl);

  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> incomingServer;
  nsCOMPtr<nsIImapServerSink> imapServerSink;

  rv = aMsgFolder->GetServer(getter_AddRefs(incomingServer));
  if (NS_SUCCEEDED(rv) && incomingServer) {
    imapServerSink = do_QueryInterface(incomingServer);
    if (imapServerSink) aImapUrl->SetImapServerSink(imapServerSink);
  }

  nsCOMPtr<nsIImapMailFolderSink> imapMailFolderSink =
      do_QueryInterface(aMsgFolder);
  if (NS_SUCCEEDED(rv) && imapMailFolderSink)
    aImapUrl->SetImapMailFolderSink(imapMailFolderSink);

  nsCOMPtr<nsIImapMessageSink> imapMessageSink = do_QueryInterface(aMsgFolder);
  if (NS_SUCCEEDED(rv) && imapMessageSink)
    aImapUrl->SetImapMessageSink(imapMessageSink);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aImapUrl);
  mailnewsUrl->SetFolder(aMsgFolder);

  return NS_OK;
}

NS_IMETHODIMP nsImapService::DiscoverAllFolders(nsIMsgFolder* aImapMailFolder,
                                                nsIUrlListener* aUrlListener,
                                                nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    rv = SetImapUrlSink(aImapMailFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);
      mailnewsurl->SetMsgWindow(aMsgWindow);
      urlSpec.AppendLiteral("/discoverallboxes");
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::DiscoverAllAndSubscribedFolders(
    nsIMsgFolder* aImapMailFolder, nsIUrlListener* aUrlListener,
    nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsCOMPtr<nsIImapUrl> aImapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(aImapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && aImapUrl) {
    rv = SetImapUrlSink(aImapMailFolder, aImapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(aImapUrl);
      urlSpec.AppendLiteral("/discoverallandsubscribedboxes");
      rv = mailnewsurl->SetSpecInternal(urlSpec);

      if (aMsgWindow) mailnewsurl->SetMsgWindow(aMsgWindow);

      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(aImapUrl, nullptr, nullptr);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::DiscoverChildren(nsIMsgFolder* aImapMailFolder,
                                              nsIUrlListener* aUrlListener,
                                              const nsACString& folderPath) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  nsCOMPtr<nsIImapUrl> aImapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aImapMailFolder);
  nsresult rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(aImapUrl),
                                     aImapMailFolder, aUrlListener, urlSpec,
                                     hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    rv = SetImapUrlSink(aImapMailFolder, aImapUrl);
    if (NS_SUCCEEDED(rv)) {
      if (!folderPath.IsEmpty()) {
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(aImapUrl);
        urlSpec.AppendLiteral("/discoverchildren>");
        urlSpec.Append(hierarchyDelimiter);
        urlSpec.Append(folderPath);
        rv = mailnewsurl->SetSpecInternal(urlSpec);

        // Make sure the uri has the same hierarchy separator as the one in msg
        // folder obj if it's not kOnlineHierarchySeparatorUnknown (ie, '^').
        char uriDelimiter;
        nsresult rv1 = aImapUrl->GetOnlineSubDirSeparator(&uriDelimiter);
        if (NS_SUCCEEDED(rv1) &&
            hierarchyDelimiter != kOnlineHierarchySeparatorUnknown &&
            uriDelimiter != hierarchyDelimiter)
          aImapUrl->SetOnlineSubDirSeparator(hierarchyDelimiter);

        if (NS_SUCCEEDED(rv))
          rv = GetImapConnectionAndLoadUrl(aImapUrl, nullptr, nullptr);
      } else
        rv = NS_ERROR_FAILURE;
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::OnlineMessageCopy(
    nsIMsgFolder* aSrcFolder, const nsACString& messageIds,
    nsIMsgFolder* aDstFolder, bool idsAreUids, bool isMove,
    nsIUrlListener* aUrlListener, nsIURI** aURL, nsISupports* copyState,
    nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aSrcFolder);
  NS_ENSURE_ARG_POINTER(aDstFolder);

  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> srcServer;
  nsCOMPtr<nsIMsgIncomingServer> dstServer;

  rv = aSrcFolder->GetServer(getter_AddRefs(srcServer));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aDstFolder->GetServer(getter_AddRefs(dstServer));
  NS_ENSURE_SUCCESS(rv, rv);

  bool sameServer;
  rv = dstServer->Equals(srcServer, &sameServer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!sameServer) {
    NS_ASSERTION(false, "can't use this method to copy across servers");
    // *** can only take message from the same imap host and user accnt
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aSrcFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), aSrcFolder,
                            aUrlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    SetImapUrlSink(aSrcFolder, imapUrl);
    imapUrl->SetCopyState(copyState);

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl(do_QueryInterface(imapUrl));
    mailnewsurl->SetMsgWindow(aMsgWindow);

    if (isMove)
      urlSpec.AppendLiteral("/onlinemove>");
    else
      urlSpec.AppendLiteral("/onlinecopy>");
    if (idsAreUids)
      urlSpec.Append(uidString);
    else
      urlSpec.Append(sequenceString);
    urlSpec.Append('>');
    urlSpec.Append(hierarchyDelimiter);

    nsCString folderName;
    GetFolderName(aSrcFolder, folderName);
    urlSpec.Append(folderName);
    urlSpec.Append('>');
    urlSpec.Append(messageIds);
    urlSpec.Append('>');
    urlSpec.Append(hierarchyDelimiter);
    folderName.Adopt(strdup(""));
    GetFolderName(aDstFolder, folderName);
    urlSpec.Append(folderName);

    rv = mailnewsurl->SetSpecInternal(urlSpec);
    if (NS_SUCCEEDED(rv))
      rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
  }
  return rv;
}

nsresult nsImapService::OfflineAppendFromFile(
    nsIFile* aFile, nsIURI* aUrl, nsIMsgFolder* aDstFolder,
    const nsACString& messageId,  // to be replaced
    bool inSelectedState,         // needs to be in
    nsIUrlListener* aListener, nsIURI** aURL, nsISupports* aCopyState) {
  nsCOMPtr<nsIMsgDatabase> destDB;
  nsresult rv = aDstFolder->GetMsgDatabase(getter_AddRefs(destDB));
  // ### might need to send some notifications instead of just returning

  bool isLocked;
  aDstFolder->GetLocked(&isLocked);
  if (isLocked) return NS_MSG_FOLDER_BUSY;

  if (NS_SUCCEEDED(rv) && destDB) {
    nsMsgKey fakeKey;
    destDB->GetNextFakeOfflineMsgKey(&fakeKey);

    nsCOMPtr<nsIMsgOfflineImapOperation> op;
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb = do_QueryInterface(destDB, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = opsDb->GetOfflineOpForKey(fakeKey, true, getter_AddRefs(op));
    if (NS_SUCCEEDED(rv) && op) {
      nsCString destFolderUri;
      aDstFolder->GetURI(destFolderUri);
      op->SetOperation(
          nsIMsgOfflineImapOperation::kAppendDraft);  // ### do we care if it's
                                                      // a template?
      op->SetDestinationFolderURI(destFolderUri);
      nsCOMPtr<nsIOutputStream> outputStream;
      nsCOMPtr<nsIMsgPluggableStore> msgStore;
      nsCOMPtr<nsIMsgIncomingServer> dstServer;
      nsCOMPtr<nsIMsgDBHdr> newMsgHdr;

      aDstFolder->GetServer(getter_AddRefs(dstServer));
      rv = dstServer->GetMsgStore(getter_AddRefs(msgStore));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = destDB->CreateNewHdr(fakeKey, getter_AddRefs(newMsgHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = aDstFolder->GetOfflineStoreOutputStream(
          newMsgHdr, getter_AddRefs(outputStream));

      if (NS_SUCCEEDED(rv) && outputStream) {
        nsCOMPtr<nsIInputStream> inputStream;
        nsCOMPtr<nsIMsgParseMailMsgState> msgParser = do_CreateInstance(
            "@mozilla.org/messenger/messagestateparser;1", &rv);
        msgParser->SetMailDB(destDB);

        rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), aFile);
        if (NS_SUCCEEDED(rv) && inputStream) {
          // now, copy the temp file to the offline store for the dest folder.
          RefPtr<nsMsgLineStreamBuffer> inputStreamBuffer =
              new nsMsgLineStreamBuffer(
                  FILE_IO_BUFFER_SIZE,
                  true,    // allocate new lines
                  false);  // leave CRLFs on the returned string
          int64_t fileSize;
          aFile->GetFileSize(&fileSize);
          uint32_t bytesWritten;
          rv = NS_OK;
          // rv = inputStream->Read(inputBuffer, inputBufferSize, &bytesRead);
          // if (NS_SUCCEEDED(rv) && bytesRead > 0)
          msgParser->SetState(nsIMsgParseMailMsgState::ParseHeadersState);
          msgParser->SetNewMsgHdr(newMsgHdr);
          // set the new key to fake key so the msg hdr will have that for a key
          msgParser->SetNewKey(fakeKey);
          bool needMoreData = false;
          char* newLine = nullptr;
          uint32_t numBytesInLine = 0;
          do {
            newLine = inputStreamBuffer->ReadNextLine(
                inputStream, numBytesInLine, needMoreData);
            if (newLine) {
              msgParser->ParseAFolderLine(newLine, numBytesInLine);
              rv = outputStream->Write(newLine, numBytesInLine, &bytesWritten);
              free(newLine);
            }
          } while (newLine);
          msgParser->FinishHeader();

          if (NS_SUCCEEDED(rv)) {
            uint32_t resultFlags;
            newMsgHdr->OrFlags(
                nsMsgMessageFlags::Offline | nsMsgMessageFlags::Read,
                &resultFlags);
            newMsgHdr->SetOfflineMessageSize(fileSize);
            destDB->AddNewHdrToDB(newMsgHdr, true /* notify */);
            aDstFolder->SetFlag(nsMsgFolderFlags::OfflineEvents);
            if (msgStore) msgStore->FinishNewMessage(outputStream, newMsgHdr);
          }
          // tell the listener we're done.
          inputStream->Close();
          inputStream = nullptr;
          aListener->OnStopRunningUrl(aUrl, NS_OK);
        }
        outputStream->Close();
      }
    }
  }

  if (destDB) destDB->Close(true);
  return rv;
}

/* append message from file url */
/* imap://HOST>appendmsgfromfile>DESTINATIONMAILBOXPATH */
/* imap://HOST>appenddraftfromfile>DESTINATIONMAILBOXPATH>UID>messageId */
NS_IMETHODIMP nsImapService::AppendMessageFromFile(
    nsIFile* aFile, nsIMsgFolder* aDstFolder,
    const nsACString& messageId,  // to be replaced
    bool idsAreUids,
    bool inSelectedState,  // needs to be in
    nsIUrlListener* aListener, nsISupports* aCopyState,
    nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aFile);
  NS_ENSURE_ARG_POINTER(aDstFolder);

  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(aDstFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), aDstFolder,
                            aListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl = do_QueryInterface(imapUrl);
    if (msgUrl && aMsgWindow) {
      // we get the loadGroup from msgWindow
      msgUrl->SetMsgWindow(aMsgWindow);
    }

    SetImapUrlSink(aDstFolder, imapUrl);
    imapUrl->SetMsgFile(aFile);
    imapUrl->SetCopyState(aCopyState);

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

    if (inSelectedState)
      urlSpec.AppendLiteral("/appenddraftfromfile>");
    else
      urlSpec.AppendLiteral("/appendmsgfromfile>");

    urlSpec.Append(hierarchyDelimiter);

    nsCString folderName;
    GetFolderName(aDstFolder, folderName);
    urlSpec.Append(folderName);

    if (inSelectedState) {
      urlSpec.Append('>');
      if (idsAreUids)
        urlSpec.Append(uidString);
      else
        urlSpec.Append(sequenceString);
      urlSpec.Append('>');
      if (!messageId.IsEmpty()) urlSpec.Append(messageId);
    }

    rv = mailnewsurl->SetSpecInternal(urlSpec);
    if (WeAreOffline()) {
      // handle offline append to drafts or templates folder here.
      return OfflineAppendFromFile(aFile, mailnewsurl, aDstFolder, messageId,
                                   inSelectedState, aListener, nullptr,
                                   aCopyState);
    }
    if (NS_SUCCEEDED(rv))
      rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
  }
  return rv;
}

nsresult nsImapService::GetImapConnectionAndLoadUrl(nsIImapUrl* aImapUrl,
                                                    nsISupports* aConsumer,
                                                    nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapUrl);

  bool isValidUrl;
  aImapUrl->GetValidUrl(&isValidUrl);
  if (!isValidUrl) return NS_ERROR_FAILURE;

  if (WeAreOffline()) {
    nsImapAction imapAction;

    // the only thing we can do offline is fetch messages.
    // ### TODO - need to look at msg copy, save attachment, etc. when we
    // have offline message bodies.
    aImapUrl->GetImapAction(&imapAction);
    if (imapAction != nsIImapUrl::nsImapMsgFetch &&
        imapAction != nsIImapUrl::nsImapSaveMessageToDisk)
      return NS_MSG_ERROR_OFFLINE;
  }

  nsCOMPtr<nsIMsgIncomingServer> aMsgIncomingServer;
  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl = do_QueryInterface(aImapUrl);
  nsresult rv = msgUrl->GetServer(getter_AddRefs(aMsgIncomingServer));

  if (aURL) {
    msgUrl.forget(aURL);
  }

  if (NS_SUCCEEDED(rv) && aMsgIncomingServer) {
    nsCOMPtr<nsIImapIncomingServer> aImapServer(
        do_QueryInterface(aMsgIncomingServer, &rv));
    if (NS_SUCCEEDED(rv) && aImapServer)
      rv = aImapServer->GetImapConnectionAndLoadUrl(aImapUrl, aConsumer);
  }
  return rv;
}

NS_IMETHODIMP nsImapService::MoveFolder(nsIMsgFolder* srcFolder,
                                        nsIMsgFolder* dstFolder,
                                        nsIUrlListener* urlListener,
                                        nsIMsgWindow* msgWindow) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  NS_ENSURE_ARG_POINTER(dstFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;

  char default_hierarchyDelimiter = GetHierarchyDelimiter(dstFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), dstFolder,
                            urlListener, urlSpec, default_hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = SetImapUrlSink(dstFolder, imapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
      if (mailNewsUrl) mailNewsUrl->SetMsgWindow(msgWindow);
      char hierarchyDelimiter = kOnlineHierarchySeparatorUnknown;
      nsCString folderName;

      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);
      GetFolderName(srcFolder, folderName);
      urlSpec.AppendLiteral("/movefolderhierarchy>");
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      GetFolderName(dstFolder, folderName);
      if (!folderName.IsEmpty()) {
        urlSpec.Append(hierarchyDelimiter);
        urlSpec.Append(folderName);
      }
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv)) {
        GetFolderName(srcFolder, folderName);
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::RenameLeaf(nsIMsgFolder* srcFolder,
                                        const nsAString& newLeafName,
                                        nsIUrlListener* urlListener,
                                        nsIMsgWindow* msgWindow) {
  NS_ENSURE_ARG_POINTER(srcFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;

  char hierarchyDelimiter = GetHierarchyDelimiter(srcFolder);
  nsresult rv =
      CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), srcFolder,
                           urlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv)) {
    rv = SetImapUrlSink(srcFolder, imapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
      mailNewsUrl->SetMsgWindow(msgWindow);
      nsCString folderName;
      GetFolderName(srcFolder, folderName);
      urlSpec.AppendLiteral("/rename>");
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(hierarchyDelimiter);
      nsAutoCString cStrFolderName;
      // Unescape the name before looking for parent path
      MsgUnescapeString(folderName, 0, cStrFolderName);
      int32_t leafNameStart = cStrFolderName.RFindChar(hierarchyDelimiter);
      if (leafNameStart != -1) {
        cStrFolderName.SetLength(leafNameStart + 1);
        urlSpec.Append(cStrFolderName);
      }

      nsAutoCString utfNewName;
      bool utf8AcceptEnabled;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(srcFolder);
      rv = imapFolder->GetShouldUseUtf8FolderName(&utf8AcceptEnabled);
      NS_ENSURE_SUCCESS(rv, rv);
      if (utf8AcceptEnabled) {
        CopyUTF16toUTF8(newLeafName, utfNewName);
      } else {
        CopyUTF16toMUTF7(newLeafName, utfNewName);
      }
      nsCString escapedNewName;
      MsgEscapeString(utfNewName, nsINetUtil::ESCAPE_URL_PATH, escapedNewName);
      nsCString escapedSlashName;
      rv = nsImapUrl::EscapeSlashes(escapedNewName.get(),
                                    getter_Copies(escapedSlashName));
      NS_ENSURE_SUCCESS(rv, rv);
      urlSpec.Append(escapedSlashName);

      rv = mailNewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::CreateFolder(nsIMsgFolder* parent,
                                          const nsAString& newFolderName,
                                          nsIUrlListener* urlListener,
                                          nsIURI** url) {
  NS_ENSURE_ARG_POINTER(parent);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;

  char hierarchyDelimiter = GetHierarchyDelimiter(parent);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), parent,
                            urlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = SetImapUrlSink(parent, imapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

      nsCString folderName;
      GetFolderName(parent, folderName);
      urlSpec.AppendLiteral("/create>");
      urlSpec.Append(hierarchyDelimiter);
      if (!folderName.IsEmpty()) {
        nsCString canonicalName;
        nsImapUrl::ConvertToCanonicalFormat(
            folderName.get(), hierarchyDelimiter, getter_Copies(canonicalName));
        urlSpec.Append(canonicalName);
        urlSpec.Append(hierarchyDelimiter);
      }

      nsAutoCString utfNewName;
      bool utf8AcceptEnabled;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(parent);
      rv = imapFolder->GetShouldUseUtf8FolderName(&utf8AcceptEnabled);
      NS_ENSURE_SUCCESS(rv, rv);
      if (utf8AcceptEnabled) {
        CopyUTF16toUTF8(newFolderName, utfNewName);
      } else {
        CopyUTF16toMUTF7(newFolderName, utfNewName);
      }
      nsCString escapedFolderName;
      MsgEscapeString(utfNewName, nsINetUtil::ESCAPE_URL_PATH,
                      escapedFolderName);
      urlSpec.Append(escapedFolderName);

      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, url);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::EnsureFolderExists(nsIMsgFolder* parent,
                                                const nsAString& newFolderName,
                                                nsIMsgWindow* msgWindow,
                                                nsIUrlListener* urlListener) {
  NS_ENSURE_ARG_POINTER(parent);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;

  char hierarchyDelimiter = GetHierarchyDelimiter(parent);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), parent,
                            urlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = SetImapUrlSink(parent, imapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);

      nsCString folderName;
      GetFolderName(parent, folderName);
      urlSpec.AppendLiteral("/ensureExists>");
      urlSpec.Append(hierarchyDelimiter);
      if (!folderName.IsEmpty()) {
        urlSpec.Append(folderName);
        urlSpec.Append(hierarchyDelimiter);
      }
      nsAutoCString utfNewName;
      bool utf8AcceptEnabled;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(parent);
      rv = imapFolder->GetShouldUseUtf8FolderName(&utf8AcceptEnabled);
      NS_ENSURE_SUCCESS(rv, rv);
      if (utf8AcceptEnabled) {
        CopyUTF16toUTF8(newFolderName, utfNewName);
      } else {
        CopyUTF16toMUTF7(newFolderName, utfNewName);
      }
      nsCString escapedFolderName;
      MsgEscapeString(utfNewName, nsINetUtil::ESCAPE_URL_PATH,
                      escapedFolderName);
      urlSpec.Append(escapedFolderName);

      rv = mailnewsurl->SetSpecInternal(urlSpec);

      if (msgWindow) mailnewsurl->SetMsgWindow(msgWindow);

      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, nullptr);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::ListFolder(nsIMsgFolder* aImapMailFolder,
                                        nsIUrlListener* aUrlListener) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/listfolder>",
                       nsIImapUrl::nsImapListFolder, nullptr, nullptr);
}

NS_IMETHODIMP nsImapService::GetScheme(nsACString& aScheme) {
  aScheme.AssignLiteral("imap");
  return NS_OK;
}

NS_IMETHODIMP nsImapService::AllowPort(int32_t port, const char* scheme,
                                       bool* aRetVal) {
  // allow imap to run on any port
  *aRetVal = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetDefaultDoBiff(bool* aDoBiff) {
  NS_ENSURE_ARG_POINTER(aDoBiff);
  // by default, do biff for IMAP servers
  *aDoBiff = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetDefaultServerPort(bool isSecure,
                                                  int32_t* aDefaultPort) {
  // Return Secure IMAP Port if secure option chosen i.e., if isSecure is TRUE
  if (isSecure)
    *aDefaultPort = nsIImapUrl::DEFAULT_IMAPS_PORT;
  else
    *aDefaultPort = nsIImapUrl::DEFAULT_IMAP_PORT;

  return NS_OK;
}

// this method first tries to find an exact username and hostname match with the
// given url then, tries to find any account on the passed in imap host in case
// this is a url to a shared imap folder.
nsresult nsImapService::GetServerFromUrl(nsIImapUrl* aImapUrl,
                                         nsIMsgIncomingServer** aServer) {
  nsresult rv;
  nsCString folderName;
  nsAutoCString userPass;
  nsAutoCString hostName;
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aImapUrl);

  // if we can't get a folder name out of the url then I think this is an error
  aImapUrl->CreateCanonicalSourceFolderPathString(folderName);
  if (folderName.IsEmpty()) {
    rv = mailnewsUrl->GetFileName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = accountManager->FindServerByURI(mailnewsUrl, aServer);

  // look for server with any user name, in case we're trying to subscribe
  // to a folder with some one else's user name like the following
  // "IMAP://userSharingFolder@server1/SharedFolderName"
  if (NS_FAILED(rv) || !aServer) {
    nsAutoCString turl;
    rv = mailnewsUrl->GetSpec(turl);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIURL> url;
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec(turl)
             .SetUserPass(EmptyCString())
             .Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = accountManager->FindServerByURI(url, aServer);
    if (*aServer) aImapUrl->SetExternalLinkUrl(true);
  }

  // if we can't extract the imap server from this url then give up!!!
  NS_ENSURE_TRUE(*aServer, NS_ERROR_FAILURE);
  return rv;
}

nsresult nsImapService::NewURI(const nsACString& aSpec,
                               const char* aOriginCharset,  // ignored
                               nsIURI* aBaseURI, nsIURI** aRetVal) {
  NS_ENSURE_ARG_POINTER(aRetVal);

  nsresult rv;
  nsCOMPtr<nsIImapUrl> aImapUrl = do_CreateInstance(kImapUrlCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // now extract lots of fun information...
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aImapUrl);
  // nsAutoCString unescapedSpec(aSpec);
  // nsUnescape(unescapedSpec.BeginWriting());

  // set the spec
  if (aBaseURI) {
    nsAutoCString newSpec;
    aBaseURI->Resolve(aSpec, newSpec);
    rv = mailnewsUrl->SetSpecInternal(newSpec);
  } else {
    rv = mailnewsUrl->SetSpecInternal(aSpec);
  }

  NS_ENSURE_SUCCESS(rv, rv);

  nsCString folderName;
  // if we can't get a folder name out of the url then I think this is an error
  aImapUrl->CreateCanonicalSourceFolderPathString(folderName);
  if (folderName.IsEmpty()) {
    rv = mailnewsUrl->GetFileName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServerFromUrl(aImapUrl, getter_AddRefs(server));
  // if we can't extract the imap server from this url then give up!!!
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(server, NS_ERROR_FAILURE);

  // now try to get the folder in question...
  nsCOMPtr<nsIMsgFolder> rootFolder;
  server->GetRootFolder(getter_AddRefs(rootFolder));
  bool ready;
  if (rootFolder && !folderName.IsEmpty() &&
      // Skip folder processing if folder names aren't ready yet.
      // They may not be available during early initialization.
      // XXX TODO: This hack can be removed when the localization system gets
      // initialized in M-C code before, for example, the permission manager
      // which creates all sorts of URIs incl. imap: URIs.
      NS_SUCCEEDED(rootFolder->FolderNamesReady(&ready)) && ready) {
    nsCOMPtr<nsIMsgFolder> folder;
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    nsCOMPtr<nsIMsgImapMailFolder> subFolder;
    if (imapRoot) {
      imapRoot->FindOnlineSubFolder(folderName, getter_AddRefs(subFolder));
      folder = do_QueryInterface(subFolder);
    }

    // If we can't find the folder, we can still create the URI
    // in this low-level service. Cloning URIs where the folder
    // isn't found is common when folders are renamed or moved.
    // We also ignore return statuses here.
    if (folder) {
      nsCOMPtr<nsIImapMessageSink> msgSink = do_QueryInterface(folder);
      (void)aImapUrl->SetImapMessageSink(msgSink);

      (void)SetImapUrlSink(folder, aImapUrl);

      nsCString messageIdString;
      aImapUrl->GetListOfMessageIds(messageIdString);
      if (!messageIdString.IsEmpty()) {
        bool useLocalCache = false;
        folder->HasMsgOffline(strtoul(messageIdString.get(), nullptr, 10),
                              &useLocalCache);
        mailnewsUrl->SetMsgIsInLocalCache(useLocalCache);
      }
    }
  }

  // we got an imap url, so be sure to return it...
  nsCOMPtr<nsIURI> imapUri = do_QueryInterface(aImapUrl);

  imapUri.forget(aRetVal);

  return rv;
}

NS_IMETHODIMP nsImapService::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                        nsIChannel** aRetVal) {
  NS_ENSURE_ARG_POINTER(aURI);
  NS_ENSURE_ARG_POINTER(aRetVal);
  MOZ_ASSERT(aLoadInfo);
  *aRetVal = nullptr;

  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(aURI, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(imapUrl, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // imap can't open and return a channel right away...the url needs to go in
  // the imap url queue until we find a connection which can run the url..in
  // order to satisfy necko, we're going to return a mock imap channel....
  nsCOMPtr<nsIImapMockChannel> channel =
      do_CreateInstance(kCImapMockChannel, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  channel->SetURI(aURI);

  rv = channel->SetLoadInfo(aLoadInfo);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString spec;
  rv = aURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  // Add the attachment disposition. This forces docShell to open the
  // attachment instead of displaying it. Content types we have special
  // handlers for are white-listed. This white list also exists in
  // nsMailboxService::NewChannel and nsNntpService::NewChannel, so if you're
  // changing this, update those too.
  if (spec.Find("part=") >= 0 && spec.Find("type=message/rfc822") < 0 &&
      spec.Find("type=application/x-message-display") < 0 &&
      spec.Find("type=application/pdf") < 0) {
    rv = channel->SetContentDisposition(nsIChannel::DISPOSITION_ATTACHMENT);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgWindow> msgWindow;
  mailnewsUrl->GetMsgWindow(getter_AddRefs(msgWindow));
  if (msgWindow) {
    nsCOMPtr<nsIDocShell> msgDocShell;
    msgWindow->GetRootDocShell(getter_AddRefs(msgDocShell));
    if (msgDocShell) {
      nsCOMPtr<nsIProgressEventSink> prevEventSink;
      channel->GetProgressEventSink(getter_AddRefs(prevEventSink));
      nsCOMPtr<nsIInterfaceRequestor> docIR(do_QueryInterface(msgDocShell));
      channel->SetNotificationCallbacks(docIR);
      // we want to use our existing event sink.
      if (prevEventSink) channel->SetProgressEventSink(prevEventSink);
    }
  } else {
    // This might not be a call resulting from user action (e.g. we might be
    // getting a new message via nsImapMailFolder::OnNewIdleMessages(), or via
    // nsAutoSyncManager, etc). In this case, try to retrieve the top-most
    // message window to update its status feedback.
    nsCOMPtr<nsIMsgMailSession> mailSession =
        do_GetService("@mozilla.org/messenger/services/session;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgWindow> msgWindow;
    rv = mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
    if (NS_SUCCEEDED(rv) && msgWindow) {
      // If we could retrieve a window, get its nsIMsgStatusFeedback and set it
      // to the URL so that other components interacting with it can correctly
      // feed status updates to the UI.
      nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
      msgWindow->GetStatusFeedback(getter_AddRefs(statusFeedback));
      mailnewsUrl->SetStatusFeedback(statusFeedback);
      // We also need to set the status feedback as the channel's progress event
      // sink, since that's how nsImapProtocol feeds some of the progress
      // changes (e.g. downloading incoming messages) to the UI.
      nsCOMPtr<nsIProgressEventSink> eventSink =
          do_QueryInterface(statusFeedback);
      channel->SetProgressEventSink(eventSink);
    }

    // This function ends by checking the final value of rv and deciding whether
    // to set aRetVal to our channel according to it. We don't want this to be
    // impacted if we fail to retrieve a window (which might not work if we're
    // being called through the command line, or through a test), so let's just
    // reset rv to an OK value.
    rv = NS_OK;
  }

  // the imap url holds a weak reference so we can pass the channel into the
  // imap protocol when we actually run the url.
  imapUrl->SetMockChannel(channel);

  bool externalLinkUrl;
  imapUrl->GetExternalLinkUrl(&externalLinkUrl);

  // Only external imap links with no action are supported. Ignore links that
  // attempt to cause an effect such as fetching a mime part. This avoids
  // spurious prompts to subscribe to folders due to "imap://...Fetch..." links
  // residing in legacy emails residing in an imap mailbox.
  if (externalLinkUrl) {
    nsImapAction imapAction;
    imapUrl->GetImapAction(&imapAction);
    if (imapAction != 0) externalLinkUrl = false;
  }

  if (externalLinkUrl) {
    // Everything after here is to handle clicking on an external link. We only
    // want to do this if we didn't run the url through the various
    // nsImapService methods, which we can tell by seeing if the sinks have been
    // setup on the url or not.
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = GetServerFromUrl(imapUrl, getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCString folderName;
    imapUrl->CreateCanonicalSourceFolderPathString(folderName);
    if (folderName.IsEmpty()) {
      nsCString escapedFolderName;
      rv = mailnewsUrl->GetFileName(escapedFolderName);
      if (!escapedFolderName.IsEmpty()) {
        MsgUnescapeString(escapedFolderName, 0, folderName);
      }
    }
    // if the parent is null, then the folder doesn't really exist, so see if
    // the user wants to subscribe to it./
    nsCOMPtr<nsIMsgFolder> urlFolder;
    // now try to get the folder in question...
    nsCOMPtr<nsIMsgFolder> rootFolder;
    server->GetRootFolder(getter_AddRefs(rootFolder));
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    nsCOMPtr<nsIMsgImapMailFolder> subFolder;
    if (imapRoot) {
      imapRoot->FindOnlineSubFolder(folderName, getter_AddRefs(subFolder));
      urlFolder = do_QueryInterface(subFolder);
    }
    nsCOMPtr<nsIMsgFolder> parent;
    if (urlFolder) urlFolder->GetParent(getter_AddRefs(parent));
    nsCString serverKey;
    nsAutoCString userPass;
    rv = mailnewsUrl->GetUserPass(userPass);
    server->GetKey(serverKey);
    nsCString fullFolderName;
    if (parent) fullFolderName = folderName;
    if (!parent && !folderName.IsEmpty() && imapRoot) {
      // Check if this folder is another user's folder.
      fullFolderName =
          nsImapNamespaceList::GenerateFullFolderNameWithDefaultNamespace(
              serverKey.get(), folderName.get(), userPass.get(),
              kOtherUsersNamespace, nullptr);
      // if this is another user's folder, let's see if we're already subscribed
      // to it.
      rv = imapRoot->FindOnlineSubFolder(fullFolderName,
                                         getter_AddRefs(subFolder));
      urlFolder = do_QueryInterface(subFolder);
      if (urlFolder) urlFolder->GetParent(getter_AddRefs(parent));
    }
    // if we couldn't get the fullFolderName, then we probably couldn't find
    // the other user's namespace, in which case, we shouldn't try to subscribe
    // to it.
    if (!parent && !folderName.IsEmpty() && !fullFolderName.IsEmpty()) {
      // this folder doesn't exist - check if the user wants to subscribe to
      // this folder.
      nsCOMPtr<nsIPrompt> dialog;
      nsCOMPtr<nsIWindowWatcher> wwatch(
          do_GetService(NS_WINDOWWATCHER_CONTRACTID, &rv));
      NS_ENSURE_SUCCESS(rv, rv);
      wwatch->GetNewPrompter(nullptr, getter_AddRefs(dialog));

      nsString statusString, confirmText;
      nsCOMPtr<nsIStringBundle> bundle;
      rv = IMAPGetStringBundle(getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);
      // Need to convert folder name, can be MUTF-7 or UTF-8 depending on the
      // server.
      nsAutoString unescapedName;
      if (NS_FAILED(CopyFolderNameToUTF16(fullFolderName, unescapedName)))
        CopyASCIItoUTF16(fullFolderName, unescapedName);
      AutoTArray<nsString, 1> formatStrings = {unescapedName};

      rv = bundle->FormatStringFromName("imapSubscribePrompt", formatStrings,
                                        confirmText);
      NS_ENSURE_SUCCESS(rv, rv);

      bool confirmResult = false;
      rv = dialog->Confirm(nullptr, confirmText.get(), &confirmResult);
      NS_ENSURE_SUCCESS(rv, rv);

      if (confirmResult) {
        nsCOMPtr<nsIImapIncomingServer> imapServer = do_QueryInterface(server);
        if (imapServer) {
          nsCOMPtr<nsIURI> subscribeURI;
          // Now we have the real folder name to try to subscribe to. Let's try
          // running a subscribe url and returning that as the uri we've
          // created. We need to convert this to unicode because that's what
          // subscribe wants.
          nsAutoString unicodeName;
          CopyFolderNameToUTF16(fullFolderName, unicodeName);
          rv = imapServer->SubscribeToFolder(unicodeName, true,
                                             getter_AddRefs(subscribeURI));
          if (NS_SUCCEEDED(rv) && subscribeURI) {
            nsCOMPtr<nsIImapUrl> imapSubscribeUrl =
                do_QueryInterface(subscribeURI);
            if (imapSubscribeUrl) imapSubscribeUrl->SetExternalLinkUrl(true);
            nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
                do_QueryInterface(subscribeURI);
            if (mailnewsUrl) {
              nsCOMPtr<nsIMsgMailSession> mailSession = do_GetService(
                  "@mozilla.org/messenger/services/session;1", &rv);
              NS_ENSURE_SUCCESS(rv, rv);
              nsCOMPtr<nsIMsgWindow> msgWindow;
              rv = mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
              if (NS_SUCCEEDED(rv) && msgWindow) {
                mailnewsUrl->SetMsgWindow(msgWindow);
                nsCOMPtr<nsIUrlListener> listener =
                    do_QueryInterface(rootFolder);
                if (listener) mailnewsUrl->RegisterListener(listener);
              }
            }
          }
        }
      }
      // error out this channel, so it'll stop trying to run the url.
      rv = NS_ERROR_FAILURE;
      *aRetVal = nullptr;
    }
    // this folder exists - check if this is a click on a link to the folder
    // in which case, we'll select it.
    else if (!fullFolderName.IsEmpty()) {
      nsCOMPtr<nsIMsgFolder> imapFolder;
      mailnewsUrl->GetFolder(getter_AddRefs(imapFolder));
      NS_ASSERTION(
          imapFolder,
          nsPrintfCString("No folder for imap url: %s", spec.get()).get());

      nsCOMPtr<nsIMsgMailSession> mailSession =
          do_GetService("@mozilla.org/messenger/services/session;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIMsgWindow> msgWindow;
      rv = mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
      if (NS_SUCCEEDED(rv) && msgWindow) {
        // Clicked IMAP folder URL in the window.
        nsCOMPtr<nsIObserverService> obsServ =
            mozilla::services::GetObserverService();
        obsServ->NotifyObservers(imapFolder, "folder-attention", nullptr);
        // null out this channel, so it'll stop trying to run the url.
        *aRetVal = nullptr;
        rv = NS_OK;
      } else {
        // Got IMAP folder URL from command line (most likely).
        // Set action to nsImapSelectFolder (x-application-imapfolder), so
        // ::HandleContent will handle it.
        imapUrl->SetImapAction(nsIImapUrl::nsImapSelectFolder);
        HandleContent("x-application-imapfolder", nullptr, channel);
      }
    }
  }
  if (NS_SUCCEEDED(rv)) channel.forget(aRetVal);
  return rv;
}

NS_IMETHODIMP nsImapService::SetDefaultLocalPath(nsIFile* aPath) {
  NS_ENSURE_ARG_POINTER(aPath);

  return NS_SetPersistentFile(PREF_MAIL_ROOT_IMAP_REL, PREF_MAIL_ROOT_IMAP,
                              aPath);
}

NS_IMETHODIMP nsImapService::GetDefaultLocalPath(nsIFile** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  bool havePref;
  nsCOMPtr<nsIFile> localFile;
  nsresult rv = NS_GetPersistentFile(
      PREF_MAIL_ROOT_IMAP_REL, PREF_MAIL_ROOT_IMAP, NS_APP_IMAP_MAIL_50_DIR,
      havePref, getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(localFile, NS_ERROR_FAILURE);

  bool exists;
  rv = localFile->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists)
    rv = localFile->Create(nsIFile::DIRECTORY_TYPE, 0775);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!havePref || !exists) {
    rv = NS_SetPersistentFile(PREF_MAIL_ROOT_IMAP_REL, PREF_MAIL_ROOT_IMAP,
                              localFile);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Failed to set root dir pref.");
  }

  localFile.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetServerIID(nsIID& aServerIID) {
  aServerIID = nsIID(NS_GET_IID(nsIImapIncomingServer));
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetRequiresUsername(bool* aRequiresUsername) {
  NS_ENSURE_ARG_POINTER(aRequiresUsername);

  *aRequiresUsername = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetPreflightPrettyNameWithEmailAddress(
    bool* aPreflightPrettyNameWithEmailAddress) {
  NS_ENSURE_ARG_POINTER(aPreflightPrettyNameWithEmailAddress);

  *aPreflightPrettyNameWithEmailAddress = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetCanLoginAtStartUp(bool* aCanLoginAtStartUp) {
  NS_ENSURE_ARG_POINTER(aCanLoginAtStartUp);
  *aCanLoginAtStartUp = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetCanDelete(bool* aCanDelete) {
  NS_ENSURE_ARG_POINTER(aCanDelete);
  *aCanDelete = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetCanDuplicate(bool* aCanDuplicate) {
  NS_ENSURE_ARG_POINTER(aCanDuplicate);
  *aCanDuplicate = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetCanGetMessages(bool* aCanGetMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetMessages);
  *aCanGetMessages = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetCanGetIncomingMessages(
    bool* aCanGetIncomingMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetIncomingMessages);
  *aCanGetIncomingMessages = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetShowComposeMsgLink(bool* showComposeMsgLink) {
  NS_ENSURE_ARG_POINTER(showComposeMsgLink);
  *showComposeMsgLink = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetFoldersCreatedAsync(bool* aAsyncCreation) {
  NS_ENSURE_ARG_POINTER(aAsyncCreation);
  *aAsyncCreation = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapService::GetListOfFoldersWithPath(
    nsIImapIncomingServer* aServer, nsIMsgWindow* aMsgWindow,
    const nsACString& folderPath) {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(aServer);
  if (!server) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  rv = server->GetRootMsgFolder(getter_AddRefs(rootMsgFolder));

  NS_ENSURE_TRUE(NS_SUCCEEDED(rv) && rootMsgFolder, NS_ERROR_FAILURE);

  nsCOMPtr<nsIUrlListener> listener = do_QueryInterface(aServer, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!listener) return NS_ERROR_FAILURE;

  // Locate the folder so that the correct hierarchical delimiter is used in the
  // folder pathnames, otherwise root's (ie, '^') is used and this is wrong.
  nsCOMPtr<nsIMsgFolder> msgFolder;
  if (rootMsgFolder && !folderPath.IsEmpty()) {
    // If the folder path contains 'INBOX' of any forms, we need to convert it
    // to uppercase before finding it under the root folder. We do the same in
    // PossibleImapMailbox().
    nsAutoCString tempFolderName(folderPath);
    nsAutoCString tokenStr, remStr, changedStr;
    int32_t slashPos = tempFolderName.FindChar('/');
    if (slashPos > 0) {
      tokenStr = StringHead(tempFolderName, slashPos);
      remStr = Substring(tempFolderName, slashPos);
    } else
      tokenStr.Assign(tempFolderName);

    if (tokenStr.LowerCaseEqualsLiteral("inbox") &&
        !tokenStr.EqualsLiteral("INBOX"))
      changedStr.AppendLiteral("INBOX");
    else
      changedStr.Append(tokenStr);

    if (slashPos > 0) changedStr.Append(remStr);

    rv = rootMsgFolder->FindSubFolder(changedStr, getter_AddRefs(msgFolder));
  }
  return DiscoverChildren(msgFolder, listener, folderPath);
}

NS_IMETHODIMP nsImapService::GetListOfFoldersOnServer(
    nsIImapIncomingServer* aServer, nsIMsgWindow* aMsgWindow) {
  nsresult rv;

  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(aServer);
  if (!server) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  rv = server->GetRootMsgFolder(getter_AddRefs(rootMsgFolder));

  NS_ENSURE_SUCCESS(rv, rv);
  if (!rootMsgFolder) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIUrlListener> listener = do_QueryInterface(aServer, &rv);
  NS_ENSURE_TRUE(NS_SUCCEEDED(rv) && listener, NS_ERROR_FAILURE);

  return DiscoverAllAndSubscribedFolders(rootMsgFolder, listener, aMsgWindow);
}

NS_IMETHODIMP nsImapService::SubscribeFolder(nsIMsgFolder* aFolder,
                                             const nsAString& aFolderName,
                                             nsIUrlListener* urlListener,
                                             nsIURI** url) {
  return ChangeFolderSubscription(aFolder, aFolderName, "/subscribe>",
                                  urlListener, url);
}

nsresult nsImapService::ChangeFolderSubscription(nsIMsgFolder* folder,
                                                 const nsAString& folderName,
                                                 const char* command,
                                                 nsIUrlListener* urlListener,
                                                 nsIURI** url) {
  NS_ENSURE_ARG_POINTER(folder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;
  char hierarchyDelimiter = GetHierarchyDelimiter(folder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), folder,
                            urlListener, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    rv = SetImapUrlSink(folder, imapUrl);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(imapUrl);
      urlSpec.Append(command);
      urlSpec.Append(hierarchyDelimiter);
      // `folderName` contains MUFT-7 or UTF-8 as required by the server here.
      NS_ConvertUTF16toUTF8 utfFolderName(folderName);
      nsCString escapedFolderName;
      MsgEscapeString(utfFolderName, nsINetUtil::ESCAPE_URL_PATH,
                      escapedFolderName);
      urlSpec.Append(escapedFolderName);
      rv = mailnewsurl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, url);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::UnsubscribeFolder(nsIMsgFolder* aFolder,
                                               const nsAString& aFolderName,
                                               nsIUrlListener* aUrlListener,
                                               nsIURI** aUrl) {
  return ChangeFolderSubscription(aFolder, aFolderName, "/unsubscribe>",
                                  aUrlListener, aUrl);
}

NS_IMETHODIMP nsImapService::GetFolderAdminUrl(nsIMsgFolder* aImapMailFolder,
                                               nsIMsgWindow* aMsgWindow,
                                               nsIUrlListener* aUrlListener,
                                               nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aImapMailFolder);

  return FolderCommand(aImapMailFolder, aUrlListener, "/refreshfolderurls>",
                       nsIImapUrl::nsImapRefreshFolderUrls, aMsgWindow, aURL);
}

NS_IMETHODIMP nsImapService::IssueCommandOnMsgs(nsIMsgFolder* anImapFolder,
                                                nsIMsgWindow* aMsgWindow,
                                                const nsACString& aCommand,
                                                const nsACString& uids,
                                                nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(anImapFolder);
  NS_ENSURE_ARG_POINTER(aMsgWindow);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;
  char hierarchyDelimiter = GetHierarchyDelimiter(anImapFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            anImapFolder, nullptr, urlSpec, hierarchyDelimiter);

  if (NS_SUCCEEDED(rv) && imapUrl) {
    // nsImapUrl::SetSpec() will set the imap action properly
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapUserDefinedMsgCommand);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    mailNewsUrl->SetMsgWindow(aMsgWindow);
    mailNewsUrl->SetUpdatingFolder(true);
    rv = SetImapUrlSink(anImapFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCString folderName;
      GetFolderName(anImapFolder, folderName);
      urlSpec.Append('/');
      urlSpec.Append(aCommand);
      urlSpec.Append('>');
      urlSpec.Append(uidString);
      urlSpec.Append('>');
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(uids);
      rv = mailNewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }  // if we have a url to run....

  return rv;
}

NS_IMETHODIMP nsImapService::FetchCustomMsgAttribute(
    nsIMsgFolder* anImapFolder, nsIMsgWindow* aMsgWindow,
    const nsACString& aAttribute, const nsACString& uids, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(anImapFolder);
  NS_ENSURE_ARG_POINTER(aMsgWindow);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;
  char hierarchyDelimiter = GetHierarchyDelimiter(anImapFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            anImapFolder, nullptr, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    // nsImapUrl::SetSpec() will set the imap action properly
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapUserDefinedFetchAttribute);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    mailNewsUrl->SetMsgWindow(aMsgWindow);
    mailNewsUrl->SetUpdatingFolder(true);
    rv = SetImapUrlSink(anImapFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCString folderName;
      GetFolderName(anImapFolder, folderName);
      urlSpec.AppendLiteral("/customFetch>UID>");
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(uids);
      urlSpec.Append('>');
      urlSpec.Append(aAttribute);
      rv = mailNewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }  // if we have a url to run....

  return rv;
}

NS_IMETHODIMP nsImapService::StoreCustomKeywords(
    nsIMsgFolder* anImapFolder, nsIMsgWindow* aMsgWindow,
    const nsACString& flagsToAdd, const nsACString& flagsToSubtract,
    const nsACString& uids, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(anImapFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;
  char hierarchyDelimiter = GetHierarchyDelimiter(anImapFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl),
                            anImapFolder, nullptr, urlSpec, hierarchyDelimiter);

  if (NS_SUCCEEDED(rv) && imapUrl) {
    // nsImapUrl::SetSpec() will set the imap action properly
    rv = imapUrl->SetImapAction(nsIImapUrl::nsImapMsgStoreCustomKeywords);

    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(imapUrl);
    mailNewsUrl->SetMsgWindow(aMsgWindow);
    mailNewsUrl->SetUpdatingFolder(true);
    rv = SetImapUrlSink(anImapFolder, imapUrl);

    if (NS_SUCCEEDED(rv)) {
      nsCString folderName;
      GetFolderName(anImapFolder, folderName);
      urlSpec.AppendLiteral("/customKeywords>UID>");
      urlSpec.Append(hierarchyDelimiter);
      urlSpec.Append(folderName);
      urlSpec.Append('>');
      urlSpec.Append(uids);
      urlSpec.Append('>');
      urlSpec.Append(flagsToAdd);
      urlSpec.Append('>');
      urlSpec.Append(flagsToSubtract);
      rv = mailNewsUrl->SetSpecInternal(urlSpec);
      if (NS_SUCCEEDED(rv))
        rv = GetImapConnectionAndLoadUrl(imapUrl, nullptr, aURL);
    }
  }  // if we have a url to run....

  return rv;
}

NS_IMETHODIMP nsImapService::DownloadMessagesForOffline(
    const nsACString& messageIds, nsIMsgFolder* aFolder,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIImapUrl> imapUrl;
  nsAutoCString urlSpec;
  nsresult rv;
  char hierarchyDelimiter = GetHierarchyDelimiter(aFolder);
  rv = CreateStartOfImapUrl(EmptyCString(), getter_AddRefs(imapUrl), aFolder,
                            nullptr, urlSpec, hierarchyDelimiter);
  if (NS_SUCCEEDED(rv) && imapUrl) {
    nsCOMPtr<nsIURI> runningURI;
    // need to pass in stream listener in order to get the channel created
    // correctly
    nsCOMPtr<nsIImapMessageSink> imapMessageSink(
        do_QueryInterface(aFolder, &rv));
    rv = FetchMessage(imapUrl, nsImapUrl::nsImapMsgDownloadForOffline, aFolder,
                      imapMessageSink, aMsgWindow, nullptr, messageIds, false,
                      getter_AddRefs(runningURI));
    if (runningURI && aUrlListener) {
      nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(runningURI));
      nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(runningURI));
      if (msgurl) msgurl->RegisterListener(aUrlListener);
      if (imapUrl) imapUrl->SetStoreResultsOffline(true);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapService::MessageURIToMsgHdr(const nsACString& uri,
                                                nsIMsgDBHdr** aRetVal) {
  NS_ENSURE_ARG_POINTER(aRetVal);

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey msgKey;
  nsresult rv = DecomposeImapURI(uri, getter_AddRefs(folder), &msgKey);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folder->GetMessageHeader(msgKey, aRetVal);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP nsImapService::PlaybackAllOfflineOperations(
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aListener,
    nsISupports** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  nsresult rv;
  nsImapOfflineSync* goOnline = new nsImapOfflineSync();
  goOnline->Init(aMsgWindow, aListener, nullptr, false);
  rv = goOnline->QueryInterface(NS_GET_IID(nsISupports), (void**)aResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (NS_SUCCEEDED(rv) && *aResult) return goOnline->ProcessNextOperation();
  return NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsImapService::DownloadAllOffineImapFolders(
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aListener) {
  RefPtr<nsImapOfflineDownloader> downloadForOffline =
      new nsImapOfflineDownloader(aMsgWindow, aListener);
  if (downloadForOffline) {
    // hold reference to this so it won't get deleted out from under itself.
    nsresult rv = downloadForOffline->ProcessNextOperation();
    return rv;
  }
  return NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsImapService::GetCacheStorage(nsICacheStorage** result) {
  nsresult rv = NS_OK;
  if (!mCacheStorage) {
    nsCOMPtr<nsICacheStorageService> cacheStorageService =
        do_GetService("@mozilla.org/netwerk/cache-storage-service;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    RefPtr<MailnewsLoadContextInfo> lci =
        new MailnewsLoadContextInfo(false, false, mozilla::OriginAttributes());

    // Determine if disk cache or memory cache is in use.
    // Note: This is mozilla system cache, not offline storage (mbox, maildir)
    // which is also sometimes referred to as cache at places in the code.
    if (mozilla::Preferences::GetBool("mail.imap.use_disk_cache2", true))
      rv = cacheStorageService->DiskCacheStorage(lci,
                                                 getter_AddRefs(mCacheStorage));
    else
      rv = cacheStorageService->MemoryCacheStorage(
          lci, getter_AddRefs(mCacheStorage));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  NS_IF_ADDREF(*result = mCacheStorage);
  return rv;
}

NS_IMETHODIMP nsImapService::HandleContent(
    const char* aContentType, nsIInterfaceRequestor* aWindowContext,
    nsIRequest* request) {
  NS_ENSURE_ARG_POINTER(request);

  nsresult rv;
  nsCOMPtr<nsIChannel> aChannel = do_QueryInterface(request, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (PL_strcasecmp(aContentType, "x-application-imapfolder") == 0) {
    nsCOMPtr<nsIURI> uri;
    rv = aChannel->GetURI(getter_AddRefs(uri));
    NS_ENSURE_SUCCESS(rv, rv);

    if (uri) {
      request->Cancel(NS_BINDING_ABORTED);
      nsCOMPtr<nsIWindowMediator> mediator(
          do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv));
      NS_ENSURE_SUCCESS(rv, rv);

      nsAutoCString uriStr;
      rv = uri->GetSpec(uriStr);
      NS_ENSURE_SUCCESS(rv, rv);

      // imap uri's are unescaped, so unescape the url.
      nsCString unescapedUriStr;
      MsgUnescapeString(uriStr, 0, unescapedUriStr);
      nsCOMPtr<nsIMessengerWindowService> messengerWindowService =
          do_GetService("@mozilla.org/messenger/windowservice;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = messengerWindowService->OpenMessengerWindowWithUri(
          "mail:3pane", unescapedUriStr, nsMsgKey_None);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  } else {
    // The content-type was not x-application-imapfolder
    return NS_ERROR_WONT_HANDLE_CONTENT;
  }

  return rv;
}

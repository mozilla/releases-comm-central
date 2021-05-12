/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsCOMPtr.h"

#include "nsMailboxService.h"
#include "nsMailboxUrl.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsMailboxProtocol.h"
#include "nsIMsgDatabase.h"
#include "nsMsgDBCID.h"
#include "MailNewsTypes.h"
#include "nsTArray.h"
#include "nsLocalUtils.h"
#include "nsMsgLocalCID.h"
#include "nsMsgBaseCID.h"
#include "nsIDocShell.h"
#include "nsMsgUtils.h"
#include "nsPop3Service.h"
#include "nsNativeCharsetUtils.h"
#include "nsNetUtil.h"
#include "nsIWebNavigation.h"
#include "prprf.h"
#include "nsIMsgHdr.h"
#include "nsIFileURL.h"
#include "mozilla/RefPtr.h"
#include "mozilla/LoadInfo.h"
#include "nsDocShellLoadState.h"
#include "nsContentUtils.h"

nsMailboxService::nsMailboxService() { mPrintingOperation = false; }

nsMailboxService::~nsMailboxService() {}

NS_IMPL_ISUPPORTS(nsMailboxService, nsIMailboxService, nsIMsgMessageService,
                  nsIProtocolHandler, nsIMsgMessageFetchPartService)

nsresult nsMailboxService::ParseMailbox(nsIMsgWindow* aMsgWindow,
                                        nsIFile* aMailboxPath,
                                        nsIStreamListener* aMailboxParser,
                                        nsIUrlListener* aUrlListener,
                                        nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aMailboxPath);

  nsresult rv;
  nsCOMPtr<nsIMailboxUrl> mailboxurl =
      do_CreateInstance(NS_MAILBOXURL_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv) && mailboxurl) {
    nsCOMPtr<nsIMsgMailNewsUrl> url = do_QueryInterface(mailboxurl);
    // okay now generate the url string
#ifdef XP_WIN
    nsString path = aMailboxPath->NativePath();
    nsCString mailboxPath;
    NS_CopyUnicodeToNative(path, mailboxPath);
#else
    nsCString mailboxPath = aMailboxPath->NativePath();
#endif
    nsAutoCString buf;
    MsgEscapeURL(mailboxPath,
                 nsINetUtil::ESCAPE_URL_MINIMAL | nsINetUtil::ESCAPE_URL_FORCED,
                 buf);
    nsEscapeNativePath(buf);
    url->SetUpdatingFolder(true);
    url->SetMsgWindow(aMsgWindow);
    nsAutoCString uriSpec("mailbox://");
    uriSpec.Append(buf);
    rv = url->SetSpecInternal(uriSpec);
    NS_ENSURE_SUCCESS(rv, rv);

    mailboxurl->SetMailboxParser(aMailboxParser);
    if (aUrlListener) url->RegisterListener(aUrlListener);

    rv = RunMailboxUrl(url, nullptr);
    NS_ENSURE_SUCCESS(rv, rv);

    if (aURL) {
      url.forget(aURL);
    }
  }

  return rv;
}

nsresult nsMailboxService::CopyMessage(const char* aSrcMailboxURI,
                                       nsIStreamListener* aMailboxCopyHandler,
                                       bool moveMessage,
                                       nsIUrlListener* aUrlListener,
                                       nsIMsgWindow* aMsgWindow,
                                       nsIURI** aURL) {
  nsMailboxAction mailboxAction = nsIMailboxUrl::ActionMoveMessage;
  if (!moveMessage) mailboxAction = nsIMailboxUrl::ActionCopyMessage;
  return FetchMessage(aSrcMailboxURI, aMailboxCopyHandler, aMsgWindow,
                      aUrlListener, nullptr, mailboxAction, nullptr, aURL);
}

nsresult nsMailboxService::CopyMessages(
    const nsTArray<nsMsgKey>& aMsgKeys, nsIMsgFolder* srcFolder,
    nsIStreamListener* aMailboxCopyHandler, bool moveMessage,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  nsresult rv = NS_OK;
  NS_ENSURE_ARG(srcFolder);
  NS_ENSURE_TRUE(!aMsgKeys.IsEmpty(), NS_ERROR_INVALID_ARG);
  nsCOMPtr<nsIMailboxUrl> mailboxurl;

  nsMailboxAction actionToUse = nsIMailboxUrl::ActionMoveMessage;
  if (!moveMessage) actionToUse = nsIMailboxUrl::ActionCopyMessage;

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  nsCOMPtr<nsIMsgDatabase> db;
  srcFolder->GetMsgDatabase(getter_AddRefs(db));
  if (db) {
    db->GetMsgHdrForKey(aMsgKeys[0], getter_AddRefs(msgHdr));
    if (msgHdr) {
      nsCString uri;
      srcFolder->GetUriForMsg(msgHdr, uri);
      rv = PrepareMessageUrl(uri.get(), aUrlListener, actionToUse,
                             getter_AddRefs(mailboxurl), aMsgWindow);

      if (NS_SUCCEEDED(rv)) {
        nsCOMPtr<nsIURI> url = do_QueryInterface(mailboxurl);
        nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(url));
        nsCOMPtr<nsIMailboxUrl> mailboxUrl(do_QueryInterface(url));
        msgUrl->SetMsgWindow(aMsgWindow);

        mailboxUrl->SetMoveCopyMsgKeys(aMsgKeys);
        rv = RunMailboxUrl(url, aMailboxCopyHandler);
      }
    }
  }
  if (aURL && mailboxurl) CallQueryInterface(mailboxurl, aURL);

  return rv;
}

nsresult nsMailboxService::FetchMessage(
    const char* aMessageURI, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener,
    const char* aFileName, /* only used by open attachment... */
    nsMailboxAction mailboxAction, const char* aCharsetOverride,
    nsIURI** aURL) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMailboxUrl> mailboxurl;
  nsMailboxAction actionToUse = mailboxAction;
  nsCOMPtr<nsIURI> url;
  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl;
  nsAutoCString uriString(aMessageURI);

  if (!strncmp(aMessageURI, "file:", 5)) {
    int64_t fileSize;
    nsCOMPtr<nsIURI> fileUri;
    rv = NS_NewURI(getter_AddRefs(fileUri), aMessageURI);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFileURL> fileUrl = do_QueryInterface(fileUri, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFile> file;
    rv = fileUrl->GetFile(getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);
    file->GetFileSize(&fileSize);
    uriString.Replace(0, 5, "mailbox:"_ns);
    uriString.AppendLiteral("&number=0");
    rv = NS_NewURI(getter_AddRefs(url), uriString);
    NS_ENSURE_SUCCESS(rv, rv);

    msgUrl = do_QueryInterface(url);
    if (msgUrl) {
      msgUrl->SetMsgWindow(aMsgWindow);
      nsCOMPtr<nsIMailboxUrl> mailboxUrl = do_QueryInterface(msgUrl, &rv);
      mailboxUrl->SetMessageSize((uint32_t)fileSize);
      nsCOMPtr<nsIMsgHeaderSink> headerSink;
      // need to tell the header sink to capture some headers to create a fake
      // db header so we can do reply to a .eml file or a rfc822 msg attachment.
      if (aMsgWindow) aMsgWindow->GetMsgHeaderSink(getter_AddRefs(headerSink));
      if (headerSink) {
        nsCOMPtr<nsIMsgDBHdr> dummyHeader;
        headerSink->GetDummyMsgHeader(getter_AddRefs(dummyHeader));
        if (dummyHeader) dummyHeader->SetMessageSize((uint32_t)fileSize);
      }
    }
  } else {
    // this happens with forward inline of message/rfc822 attachment
    // opened in a stand-alone msg window.
    int32_t typeIndex = uriString.Find("&type=application/x-message-display");
    if (typeIndex != -1) {
      uriString.Cut(typeIndex,
                    sizeof("&type=application/x-message-display") - 1);
      rv = NS_NewURI(getter_AddRefs(url), uriString.get());
      mailboxurl = do_QueryInterface(url);
    } else
      rv = PrepareMessageUrl(aMessageURI, aUrlListener, actionToUse,
                             getter_AddRefs(mailboxurl), aMsgWindow);

    if (NS_SUCCEEDED(rv)) {
      url = do_QueryInterface(mailboxurl);
      msgUrl = do_QueryInterface(url);
      msgUrl->SetMsgWindow(aMsgWindow);
      if (aFileName) msgUrl->SetFileNameInternal(nsDependentCString(aFileName));
    }
  }

  nsCOMPtr<nsIMsgI18NUrl> i18nurl(do_QueryInterface(msgUrl));
  if (i18nurl) i18nurl->SetCharsetOverRide(aCharsetOverride);

  // instead of running the mailbox url like we used to, let's try to run the
  // url in the docshell...
  nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
  // if we were given a docShell, run the url in the docshell..otherwise just
  // run it normally.
  if (NS_SUCCEEDED(rv) && docShell && url) {
    // DIRTY LITTLE HACK --> if we are opening an attachment we want the
    // docshell to treat this load as if it were a user click event. Then the
    // dispatching stuff will be much happier.
    RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(url);
    loadState->SetLoadFlags(mailboxAction == nsIMailboxUrl::ActionFetchPart
                                ? nsIWebNavigation::LOAD_FLAGS_IS_LINK
                                : nsIWebNavigation::LOAD_FLAGS_NONE);
    if (mailboxAction == nsIMailboxUrl::ActionFetchPart)
      loadState->SetLoadType(LOAD_LINK);
    loadState->SetFirstParty(false);
    loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
    rv = docShell->LoadURI(loadState, false);
  } else
    rv = RunMailboxUrl(url, aDisplayConsumer);

  if (aURL && mailboxurl) CallQueryInterface(mailboxurl, aURL);

  return rv;
}

NS_IMETHODIMP nsMailboxService::FetchMimePart(
    nsIURI* aURI, const char* aMessageURI, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, nsIURI** aURL) {
  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl(do_QueryInterface(aURI, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  msgUrl->SetMsgWindow(aMsgWindow);

  // set up the url listener
  if (aUrlListener) msgUrl->RegisterListener(aUrlListener);

  return RunMailboxUrl(msgUrl, aDisplayConsumer);
}

NS_IMETHODIMP nsMailboxService::DisplayMessage(const char* aMessageURI,
                                               nsISupports* aDisplayConsumer,
                                               nsIMsgWindow* aMsgWindow,
                                               nsIUrlListener* aUrlListener,
                                               const char* aCharsetOveride,
                                               nsIURI** aURL) {
  return FetchMessage(aMessageURI, aDisplayConsumer, aMsgWindow, aUrlListener,
                      nullptr, nsIMailboxUrl::ActionFetchMessage,
                      aCharsetOveride, aURL);
}

NS_IMETHODIMP
nsMailboxService::StreamMessage(const char* aMessageURI, nsISupports* aConsumer,
                                nsIMsgWindow* aMsgWindow,
                                nsIUrlListener* aUrlListener,
                                bool /* aConvertData */,
                                const nsACString& aAdditionalHeader,
                                bool aLocalOnly, nsIURI** aURL) {
  // The mailbox protocol object will look for "header=filter" or
  // "header=attach" to decide if it wants to convert the data instead of
  // using aConvertData. It turns out to be way too hard to pass aConvertData
  // all the way over to the mailbox protocol object.
  nsAutoCString aURIString(aMessageURI);
  if (!aAdditionalHeader.IsEmpty()) {
    aURIString.FindChar('?') == -1 ? aURIString += "?" : aURIString += "&";
    aURIString += "header=";
    aURIString += aAdditionalHeader;
  }

  return FetchMessage(aURIString.get(), aConsumer, aMsgWindow, aUrlListener,
                      nullptr, nsIMailboxUrl::ActionFetchMessage, nullptr,
                      aURL);
}

NS_IMETHODIMP nsMailboxService::StreamHeaders(const char* aMessageURI,
                                              nsIStreamListener* aConsumer,
                                              nsIUrlListener* aUrlListener,
                                              bool aLocalOnly, nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aMessageURI);
  NS_ENSURE_ARG_POINTER(aConsumer);
  nsAutoCString folderURI;
  nsMsgKey msgKey;
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv =
      DecomposeMailboxURI(aMessageURI, getter_AddRefs(folder), &msgKey);
  if (msgKey == nsMsgKey_None) return NS_MSG_MESSAGE_NOT_FOUND;

  nsCOMPtr<nsIInputStream> inputStream;
  int64_t messageOffset;
  uint32_t messageSize;
  rv = folder->GetOfflineFileStream(msgKey, &messageOffset, &messageSize,
                                    getter_AddRefs(inputStream));
  NS_ENSURE_SUCCESS(rv, rv);
  return MsgStreamMsgHeaders(inputStream, aConsumer);
}

NS_IMETHODIMP nsMailboxService::IsMsgInMemCache(nsIURI* aUrl,
                                                nsIMsgFolder* aFolder,
                                                bool* aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMailboxService::OpenAttachment(
    const char* aContentType, const char* aFileName, const char* aUrl,
    const char* aMessageUri, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener) {
  nsCOMPtr<nsIURI> URL;
  nsAutoCString urlString(aUrl);
  urlString += "&type=";
  urlString += aContentType;
  urlString += "&filename=";
  urlString += aFileName;
  nsresult rv = NS_NewURI(getter_AddRefs(URL), urlString);
  NS_ENSURE_SUCCESS(rv, rv);

  // try to run the url in the docshell...
  nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(aDisplayConsumer, &rv));
  // if we were given a docShell, run the url in the docshell..otherwise just
  // run it normally.
  if (NS_SUCCEEDED(rv) && docShell) {
    // DIRTY LITTLE HACK --> since we are opening an attachment we want the
    // docshell to treat this load as if it were a user click event. Then the
    // dispatching stuff will be much happier.
    RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(URL);
    loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_IS_LINK);
    loadState->SetLoadType(LOAD_LINK);
    loadState->SetFirstParty(false);
    loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
    return docShell->LoadURI(loadState, false);
  }
  return RunMailboxUrl(URL, aDisplayConsumer);
}

NS_IMETHODIMP
nsMailboxService::SaveMessageToDisk(const char* aMessageURI, nsIFile* aFile,
                                    bool aAddDummyEnvelope,
                                    nsIUrlListener* aUrlListener, nsIURI** aURL,
                                    bool canonicalLineEnding,
                                    nsIMsgWindow* aMsgWindow) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMailboxUrl> mailboxurl;

  rv = PrepareMessageUrl(aMessageURI, aUrlListener,
                         nsIMailboxUrl::ActionSaveMessageToDisk,
                         getter_AddRefs(mailboxurl), aMsgWindow);

  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(mailboxurl);
    if (msgUrl) {
      msgUrl->SetMessageFile(aFile);
      msgUrl->SetAddDummyEnvelope(aAddDummyEnvelope);
      msgUrl->SetCanonicalLineEnding(canonicalLineEnding);
    }

    nsCOMPtr<nsIURI> url = do_QueryInterface(mailboxurl);
    rv = RunMailboxUrl(url);
  }

  if (aURL && mailboxurl) CallQueryInterface(mailboxurl, aURL);

  return rv;
}

NS_IMETHODIMP nsMailboxService::GetUrlForUri(const nsACString& aMessageURI,
                                             nsIMsgWindow* aMsgWindow,
                                             nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aURL);
  if (!strncmp(PromiseFlatCString(aMessageURI).get(), "file:", 5) ||
      PL_strstr(PromiseFlatCString(aMessageURI).get(),
                "type=application/x-message-display") ||
      !strncmp(PromiseFlatCString(aMessageURI).get(), "mailbox:", 8))
    return NS_NewURI(aURL, PromiseFlatCString(aMessageURI).get());

  nsresult rv = NS_OK;
  nsCOMPtr<nsIMailboxUrl> mailboxurl;
  rv = PrepareMessageUrl(PromiseFlatCString(aMessageURI).get(), nullptr,
                         nsIMailboxUrl::ActionFetchMessage,
                         getter_AddRefs(mailboxurl), aMsgWindow);
  if (NS_SUCCEEDED(rv) && mailboxurl) rv = CallQueryInterface(mailboxurl, aURL);
  return rv;
}

// Takes a mailbox url, this method creates a protocol instance and loads the
// url into the protocol instance.
nsresult nsMailboxService::RunMailboxUrl(nsIURI* aMailboxUrl,
                                         nsISupports* aDisplayConsumer) {
  // create a protocol instance to run the url..
  RefPtr<nsMailboxProtocol> protocol = new nsMailboxProtocol(aMailboxUrl);
  // It implements nsIChannel, and all channels require loadInfo.
  protocol->SetLoadInfo(new mozilla::net::LoadInfo(
      nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER));
  nsresult rv = protocol->Initialize(aMailboxUrl);
  NS_ENSURE_SUCCESS(rv, rv);
  return protocol->LoadUrl(aMailboxUrl, aDisplayConsumer);
}

// This function takes a message uri, converts it into a file path & msgKey
// pair. It then turns that into a mailbox url object. It also registers a url
// listener if appropriate. AND it can take in a mailbox action and set that
// field on the returned url as well.
nsresult nsMailboxService::PrepareMessageUrl(const char* aSrcMsgMailboxURI,
                                             nsIUrlListener* aUrlListener,
                                             nsMailboxAction aMailboxAction,
                                             nsIMailboxUrl** aMailboxUrl,
                                             nsIMsgWindow* msgWindow) {
  nsresult rv = CallCreateInstance(NS_MAILBOXURL_CONTRACTID, aMailboxUrl);
  if (NS_SUCCEEDED(rv) && aMailboxUrl && *aMailboxUrl) {
    // okay now generate the url string
    char* urlSpec;
    nsAutoCString folderURI;
    nsMsgKey msgKey;
    nsCString folderPath;
    const char* part = PL_strstr(aSrcMsgMailboxURI, "part=");
    const char* header = PL_strstr(aSrcMsgMailboxURI, "header=");
    rv = nsParseLocalMessageURI(aSrcMsgMailboxURI, folderURI, &msgKey);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = nsLocalURI2Path(kMailboxRootURI, folderURI.get(), folderPath);

    if (NS_SUCCEEDED(rv)) {
      // set up the url spec and initialize the url with it.
      nsAutoCString buf;
      MsgEscapeURL(
          folderPath,
          nsINetUtil::ESCAPE_URL_DIRECTORY | nsINetUtil::ESCAPE_URL_FORCED,
          buf);
      if (mPrintingOperation)
        urlSpec = PR_smprintf("mailbox://%s?number=%lu&header=print", buf.get(),
                              msgKey);
      else if (part)
        urlSpec =
            PR_smprintf("mailbox://%s?number=%lu&%s", buf.get(), msgKey, part);
      else if (header)
        urlSpec = PR_smprintf("mailbox://%s?number=%lu&%s", buf.get(), msgKey,
                              header);
      else
        urlSpec = PR_smprintf("mailbox://%s?number=%lu", buf.get(), msgKey);

      nsCOMPtr<nsIMsgMailNewsUrl> url = do_QueryInterface(*aMailboxUrl);
      rv = url->SetSpecInternal(nsDependentCString(urlSpec));
      NS_ENSURE_SUCCESS(rv, rv);

      PR_smprintf_free(urlSpec);

      (*aMailboxUrl)->SetMailboxAction(aMailboxAction);

      // set up the url listener
      if (aUrlListener) rv = url->RegisterListener(aUrlListener);

      url->SetMsgWindow(msgWindow);
      nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(url);
      if (msgUrl) {
        msgUrl->SetOriginalSpec(aSrcMsgMailboxURI);
        msgUrl->SetUri(nsDependentCString(aSrcMsgMailboxURI));
      }

    }  // if we got a url
  }    // if we got a url

  return rv;
}

NS_IMETHODIMP nsMailboxService::GetScheme(nsACString& aScheme) {
  aScheme = "mailbox";
  return NS_OK;
}

NS_IMETHODIMP nsMailboxService::GetDefaultPort(int32_t* aDefaultPort) {
  NS_ENSURE_ARG_POINTER(aDefaultPort);
  *aDefaultPort = -1;  // mailbox doesn't use a port!!!!!
  return NS_OK;
}

NS_IMETHODIMP nsMailboxService::AllowPort(int32_t port, const char* scheme,
                                          bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  // don't override anything.
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxService::GetProtocolFlags(uint32_t* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = URI_NORELATIVE | URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
            URI_DANGEROUS_TO_LOAD | URI_FORBIDS_COOKIE_ACCESS
#ifdef IS_ORIGIN_IS_FULL_SPEC_DEFINED
            | ORIGIN_IS_FULL_SPEC
#endif
      ;
  return NS_OK;
}

nsresult nsMailboxService::NewURI(const nsACString& aSpec,
                                  const char* aOriginCharset, nsIURI* aBaseURI,
                                  nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = 0;
  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> aMsgUri =
      do_CreateInstance(NS_MAILBOXURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  // SetSpecInternal must not fail, or else the URL won't have a base URL and
  // we'll crash later.
  if (aBaseURI) {
    nsAutoCString newSpec;
    rv = aBaseURI->Resolve(aSpec, newSpec);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = aMsgUri->SetSpecInternal(newSpec);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    rv = aMsgUri->SetSpecInternal(aSpec);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  aMsgUri.forget(_retval);

  return rv;
}

NS_IMETHODIMP nsMailboxService::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                           nsIChannel** _retval) {
  NS_ENSURE_ARG_POINTER(aURI);
  NS_ENSURE_ARG_POINTER(_retval);
  MOZ_ASSERT(aLoadInfo);
  nsresult rv = NS_OK;
  nsAutoCString spec;
  rv = aURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  if (spec.Find("?uidl=") >= 0 || spec.Find("&uidl=") >= 0) {
    nsCOMPtr<nsIProtocolHandler> handler =
        do_GetService(NS_POP3SERVICE_CONTRACTID1, &rv);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIURI> pop3Uri;

      rv = nsPop3Service::NewURI(spec, "" /* ignored */, aURI,
                                 getter_AddRefs(pop3Uri));
      NS_ENSURE_SUCCESS(rv, rv);
      return handler->NewChannel(pop3Uri, aLoadInfo, _retval);
    }
  }

  RefPtr<nsMailboxProtocol> protocol = new nsMailboxProtocol(aURI);
  if (!protocol) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  rv = protocol->Initialize(aURI);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = protocol->SetLoadInfo(aLoadInfo);
  NS_ENSURE_SUCCESS(rv, rv);

  // Add the attachment disposition. This forces docShell to open the
  // attachment instead of displaying it. Content types we have special
  // handlers for are white-listed. This white list also exists in
  // nsImapService::NewChannel and nsNntpService::NewChannel, so if you're
  // changing this, update those too.
  if (spec.Find("part=") >= 0 && spec.Find("type=message/rfc822") < 0 &&
      spec.Find("type=application/x-message-display") < 0 &&
      spec.Find("type=application/pdf") < 0) {
    rv = protocol->SetContentDisposition(nsIChannel::DISPOSITION_ATTACHMENT);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  protocol.forget(_retval);
  return NS_OK;
}

nsresult nsMailboxService::DisplayMessageForPrinting(
    const char* aMessageURI, nsISupports* aDisplayConsumer,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, nsIURI** aURL) {
  mPrintingOperation = true;
  nsresult rv =
      FetchMessage(aMessageURI, aDisplayConsumer, aMsgWindow, aUrlListener,
                   nullptr, nsIMailboxUrl::ActionFetchMessage, nullptr, aURL);
  mPrintingOperation = false;
  return rv;
}

NS_IMETHODIMP nsMailboxService::Search(nsIMsgSearchSession* aSearchSession,
                                       nsIMsgWindow* aMsgWindow,
                                       nsIMsgFolder* aMsgFolder,
                                       const char* aMessageUri) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsMailboxService::DecomposeMailboxURI(const char* aMessageURI,
                                               nsIMsgFolder** aFolder,
                                               nsMsgKey* aMsgKey) {
  NS_ENSURE_ARG_POINTER(aMessageURI);
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aMsgKey);

  nsresult rv = NS_OK;
  nsAutoCString folderURI;
  rv = nsParseLocalMessageURI(aMessageURI, folderURI, aMsgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  return GetOrCreateFolder(folderURI, aFolder);
}

NS_IMETHODIMP
nsMailboxService::MessageURIToMsgHdr(const nsACString& uri,
                                     nsIMsgDBHdr** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgFolder> folder;
  nsMsgKey msgKey;

  rv = DecomposeMailboxURI(PromiseFlatCString(uri).get(),
                           getter_AddRefs(folder), &msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = folder->GetMessageHeader(msgKey, _retval);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

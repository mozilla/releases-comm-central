/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsService.h"

#include "IEwsClient.h"
#include "mozilla/Components.h"
#include "nsIChannel.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgPluggableStore.h"
#include "nsIStreamListener.h"
#include "nsIURIMutator.h"
#include "nsIWebNavigation.h"
#include "nsContentUtils.h"
#include "nsDocShellLoadState.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

#define ID_PROPERTY "ewsId"

NS_IMPL_ISUPPORTS(EwsService, nsIMsgMessageService)

EwsService::EwsService() = default;

EwsService::~EwsService() = default;

NS_IMETHODIMP EwsService::CopyMessage(const nsACString& aSrcURI,
                                      nsIStreamListener* aCopyListener,
                                      bool aMoveMessage,
                                      nsIUrlListener* aUrlListener,
                                      nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aCopyListener);

  nsCOMPtr<nsIURI> channelURI;
  MOZ_TRY(GetUrlForUri(aSrcURI, aMsgWindow, getter_AddRefs(channelURI)));

  nsCOMPtr<nsIIOService> netService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(netService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIChannel> messageChannel;
  MOZ_TRY(netService->NewChannelFromURI(
      channelURI, nullptr, nsContentUtils::GetSystemPrincipal(), nullptr,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER, getter_AddRefs(messageChannel)));

  return messageChannel->AsyncOpen(aCopyListener);
}

NS_IMETHODIMP EwsService::CopyMessages(
    const nsTArray<nsMsgKey>& aKeys, nsIMsgFolder* srcFolder,
    nsIStreamListener* aCopyListener, bool aMoveMessage,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow, nsIURI** _retval) {
  NS_WARNING("CopyMessages");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::LoadMessage(const nsACString& aMessageURI,
                                      nsIDocShell* aDisplayConsumer,
                                      nsIMsgWindow* aMsgWindow,
                                      nsIUrlListener* aUrlListener,
                                      bool aAutodetectCharset) {
  NS_ENSURE_ARG_POINTER(aDisplayConsumer);

  nsCOMPtr<nsIURI> channelURI;
  MOZ_TRY(GetUrlForUri(aMessageURI, aMsgWindow, getter_AddRefs(channelURI)));

  // Load the message through the provided docshell.
  RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(channelURI);
  loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_NONE);
  loadState->SetFirstParty(false);
  loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
  return aDisplayConsumer->LoadURI(loadState, false);
}

NS_IMETHODIMP EwsService::SaveMessageToDisk(const nsACString& aMessageURI,
                                            nsIFile* aFile,
                                            bool aGenerateDummyEnvelope,
                                            nsIUrlListener* aUrlListener,
                                            bool canonicalLineEnding,
                                            nsIMsgWindow* aMsgWindow) {
  NS_WARNING("SaveMessageToDisk");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::GetUrlForUri(const nsACString& aMessageURI,
                                       nsIMsgWindow* aMsgWindow,
                                       nsIURI** _retval) {
  nsCOMPtr<nsIURI> messageURI;
  MOZ_TRY(NS_NewURI(getter_AddRefs(messageURI), aMessageURI));

  // At this point, the path to the message URI is expected to look like
  // /Path/To/Folder#MessageKey. With this format, if the user switches between
  // messages in the same folder, the docshell believes we're still in the same
  // document (because only the fragment/ref changed), and skip creating a
  // channel for any message except the first one. So we need to transform the
  // path into /Path/To/Folder/MessageKey.
  nsAutoCString ref;
  nsresult rv = messageURI->GetRef(ref);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString path;
  rv = messageURI->GetFilePath(path);
  NS_ENSURE_SUCCESS(rv, rv);
  path.Append("/");
  path.Append(ref);

  // "x-moz-ews" is the scheme we use for URIs that must be used for channels
  // opened via a protocol handler consumer (such as a docshell or the I/O
  // service). These channels are expected to serve the raw content RFC822
  // content of the message referred to by the URI.
  return NS_MutateURI(messageURI)
      .SetScheme("x-moz-ews"_ns)
      .SetPathQueryRef(path)
      .Finalize(_retval);
}

NS_IMETHODIMP EwsService::Search(nsIMsgSearchSession* aSearchSession,
                                 nsIMsgWindow* aMsgWindow,
                                 nsIMsgFolder* aMsgFolder,
                                 const nsACString& aSearchUri) {
  NS_WARNING("Search");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::StreamMessage(
    const nsACString& aMessageURI, nsIStreamListener* aStreamListener,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, bool aConvertData,
    const nsACString& aAdditionalHeader, bool aLocalOnly, nsIURI** _retval) {
  // TODO: Convert the message content when `aConvertData = true`. It's usually
  // not the case, except when we're deleting an attachment.
  nsCOMPtr<nsIURI> channelURI;
  MOZ_TRY(GetUrlForUri(aMessageURI, aMsgWindow, getter_AddRefs(channelURI)));

  nsCOMPtr<nsIIOService> netService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(netService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIChannel> messageChannel;
  MOZ_TRY(netService->NewChannelFromURI(
      channelURI, nullptr, nsContentUtils::GetSystemPrincipal(), nullptr,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER, getter_AddRefs(messageChannel)));

  return messageChannel->AsyncOpen(aStreamListener);
}

NS_IMETHODIMP EwsService::StreamHeaders(const nsACString& aMessageURI,
                                        nsIStreamListener* aConsumer,
                                        nsIUrlListener* aUrlListener,
                                        bool aLocalOnly, nsIURI** _retval) {
  NS_WARNING("StreamHeaders");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::IsMsgInMemCache(nsIURI* aUrl, nsIMsgFolder* aFolder,
                                          bool* _retval) {
  NS_WARNING("IsMsgInMemCache");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::MessageURIToMsgHdr(const nsACString& uri,
                                             nsIMsgDBHdr** _retval) {
  RefPtr<nsIURI> uriObj;
  nsresult rv = NS_NewURI(getter_AddRefs(uriObj), uri);
  NS_ENSURE_SUCCESS(rv, rv);

  return MsgHdrFromUri(uriObj, _retval);
}

//
nsresult EwsService::MsgKeyStringFromMessageURI(nsIURI* uri,
                                                nsACString& msgKey) {
  // We expect the provided URI to be of the following form:
  // `ews-message://{username}@{host}/{folder_path}#{msg_key}`.
  // Note that `ews-message` is not a registered scheme and URIs which use it
  // cannot be loaded through the standard URI loading mechanisms.
  nsresult rv = uri->GetRef(msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  if (msgKey.IsEmpty()) {
    NS_ERROR("message URI has no message key ref");
    return NS_ERROR_UNEXPECTED;
  }

  return NS_OK;
}

nsresult EwsService::MsgKeyStringFromChannelURI(nsIURI* uri, nsACString& msgKey,
                                                nsACString& folderURIPath) {
  nsresult rv = uri->GetFilePath(folderURIPath);
  NS_ENSURE_SUCCESS(rv, rv);

  // Iterate over each slash-separated word.
  for (const auto& word : folderURIPath.Split('/')) {
    // The last word is our message key.
    msgKey.Assign(word);
  }

  // Cut the message key out of the path. We want to cut the length of the key +
  // 1, to also remove the `/` character between the folder and the key.
  auto keyStartIndex = folderURIPath.Length() - msgKey.Length() - 1;
  auto keyLengthInURI = msgKey.Length() + 1;
  folderURIPath.Cut(keyStartIndex, keyLengthInURI);

  return NS_OK;
}

nsresult EwsService::MsgHdrFromUri(nsIURI* uri, nsIMsgDBHdr** _retval) {
  nsCString keyStr;
  nsCString folderURIPath;

  // Extract the message key and folder path from the URI depending on its
  // scheme.
  nsCString scheme;
  nsresult rv = uri->GetScheme(scheme);
  NS_ENSURE_SUCCESS(rv, rv);

  if (scheme.EqualsLiteral("ews-message")) {
    rv = MsgKeyStringFromMessageURI(uri, keyStr);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = uri->GetFilePath(folderURIPath);
    NS_ENSURE_SUCCESS(rv, rv);
  } else if (scheme.EqualsLiteral("x-moz-ews")) {
    rv = MsgKeyStringFromChannelURI(uri, keyStr, folderURIPath);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsMsgKey key =
      msgKeyFromInt(ParseUint64Str(PromiseFlatCString(keyStr).get()));

  // The URI provided to the folder lookup service (via `GetExistingFolder()`)
  // must match one it has in its database. Folders are created with an `ews`
  // scheme, and we need to remove the message key from the ref.
  RefPtr<nsIURI> folderUri;
  rv = NS_MutateURI(uri)
           .SetScheme("ews"_ns)
           .SetFilePath(folderURIPath)
           .SetQuery(""_ns)
           .SetRef(""_ns)
           .Finalize(getter_AddRefs(folderUri));
  NS_ENSURE_SUCCESS(rv, rv);

  // Look up the folder at this URI and use it to retrieve the rgith message
  // header.
  nsCString folderSpec;
  rv = folderUri->GetSpec(folderSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgFolder> folder;
  rv = GetExistingFolder(folderSpec, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  return folder->GetMessageHeader(key, _retval);
}

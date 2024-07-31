/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsService.h"

#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgMailNewsUrl.h"
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
  NS_WARNING("CopyMessage");
  return NS_ERROR_NOT_IMPLEMENTED;
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
  // The message service interface gives us URIs as strings, but we want
  // structured, queryable/transformable data.
  RefPtr<nsIURI> hdrUri;
  nsresult rv = NS_NewURI(getter_AddRefs(hdrUri), aMessageURI);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgDBHdr> hdr;
  rv = MsgHdrFromUri(hdrUri, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString ewsId;
  rv = hdr->GetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  if (ewsId.IsEmpty()) {
    NS_ERROR(nsPrintfCString("message %s in EWS folder has no EWS ID",
                             nsPromiseFlatCString(aMessageURI).get())
                 .get());
    return NS_ERROR_UNEXPECTED;
  }

  // We want to provide the docshell with a URI containing sufficient
  // information to identify the associated incoming mail account in addition to
  // the message ID. We expect that the URI passed to this method is an
  // `ews-message://` URI with username, hostname, and any distinguishing port,
  // so we retain that data in producing a loadable URI.
  nsCOMPtr<nsIURI> messageUri;
  rv = NS_MutateURI(hdrUri)
           .SetScheme("x-moz-ews"_ns)
           .SetPathQueryRef(ewsId)
           .Finalize(messageUri);

  RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(messageUri);
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
  return NS_NewURI(_retval, aMessageURI);
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
  NS_WARNING("StreamMessage");
  return NS_ERROR_NOT_IMPLEMENTED;
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

// Retrieves the `nsIMsgDBHdr` associated with an internal `ews-message://` URI.
nsresult EwsService::MsgHdrFromUri(nsIURI* uri, nsIMsgDBHdr** _retval) {
  // We expect the provided URI to be of the following form:
  // `ews-message://{username}@{host}/{folder_path}#{msg_key}`.
  // Note that `ews-message` is not a registered scheme and URIs which use it
  // cannot be loaded through the standard URI loading mechanisms.
  nsCString keyStr;
  nsresult rv = uri->GetRef(keyStr);
  NS_ENSURE_SUCCESS(rv, rv);

  if (keyStr.IsEmpty()) {
    NS_ERROR("message URI has no message key ref");
    return NS_ERROR_UNEXPECTED;
  }

  nsMsgKey key =
      msgKeyFromInt(ParseUint64Str(PromiseFlatCString(keyStr).get()));

  // The URI provided to the folder lookup service (via `GetExistingFolder()`)
  // must match one it has in its database. Folders are created with an `ews`
  // scheme, and we need to remove the message key from the ref.
  RefPtr<nsIURI> folderUri;
  rv = NS_MutateURI(uri)
           .SetScheme("ews"_ns)
           .SetRef(""_ns)
           .Finalize(getter_AddRefs(folderUri));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString folderSpec;
  rv = folderUri->GetSpec(folderSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgFolder> folder;
  rv = GetExistingFolder(folderSpec, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  return folder->GetMessageHeader(key, _retval);
}

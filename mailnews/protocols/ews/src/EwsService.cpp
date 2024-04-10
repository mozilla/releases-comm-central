/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsService.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsNetUtil.h"

NS_IMPL_ISUPPORTS(EwsService, nsIMsgMessageService, nsIProtocolHandler)

EwsService::EwsService() = default;

EwsService::~EwsService() = default;

nsresult EwsService::NewURI(const nsACString& spec, nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv;
  nsCOMPtr<nsIURI> newUri =
      do_CreateInstance("@mozilla.org/messenger/url;1?type=ews", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUri = do_QueryInterface(newUri);
  rv = mailnewsUri->SetSpecInternal(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  newUri.forget(_retval);

  return rv;
}

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
                                      nsISupports* aDisplayConsumer,
                                      nsIMsgWindow* aMsgWindow,
                                      nsIUrlListener* aUrlListener,
                                      bool aAutodetectCharset) {
  NS_WARNING("LoadMessage");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::SaveMessageToDisk(
    const nsACString& aMessageURI, nsIFile* aFile, bool aGenerateDummyEnvelope,
    nsIUrlListener* aUrlListener, nsIURI** aURL, bool canonicalLineEnding,
    nsIMsgWindow* aMsgWindow) {
  NS_WARNING("SaveMessageToDisk");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::GetUrlForUri(const nsACString& aMessageURI,
                                       nsIMsgWindow* aMsgWindow,
                                       nsIURI** _retval) {
  return EwsService::NewURI(aMessageURI, _retval);
}

NS_IMETHODIMP EwsService::Search(nsIMsgSearchSession* aSearchSession,
                                 nsIMsgWindow* aMsgWindow,
                                 nsIMsgFolder* aMsgFolder,
                                 const nsACString& aSearchUri) {
  NS_WARNING("Search");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::StreamMessage(
    const nsACString& aMessageURI, nsISupports* aConsumer,
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
  NS_WARNING("MessageURIToMsgHdr");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::GetScheme(nsACString& aScheme) {
  aScheme.Assign("ews");

  return NS_OK;
}

NS_IMETHODIMP EwsService::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadinfo,
                                     nsIChannel** _retval) {
  NS_WARNING("NewChannel");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::AllowPort(int32_t port, const char* scheme,
                                    bool* _retval) {
  NS_WARNING("AllowPort");
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMailChannel.h"
#include "nsHashPropertyBag.h"
#include "nsServiceManagerUtils.h"
#include "nsICharsetConverterManager.h"

NS_IMETHODIMP
nsMailChannel::AddHeaderFromMIME(const nsACString& name,
                                 const nsACString& value) {
  mHeaderNames.AppendElement(name);
  mHeaderValues.AppendElement(value);
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetHeaderNames(nsTArray<nsCString>& aHeaderNames) {
  aHeaderNames = mHeaderNames.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetHeaderValues(nsTArray<nsCString>& aHeaderValues) {
  aHeaderValues = mHeaderValues.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::HandleAttachmentFromMIME(const nsACString& contentType,
                                        const nsACString& url,
                                        const nsACString& displayName,
                                        const nsACString& uri,
                                        bool notDownloaded) {
  RefPtr<nsIWritablePropertyBag2> attachment = new nsHashPropertyBag();
  attachment->SetPropertyAsAUTF8String(u"contentType"_ns, contentType);
  attachment->SetPropertyAsAUTF8String(u"url"_ns, url);
  attachment->SetPropertyAsAUTF8String(u"displayName"_ns, displayName);
  attachment->SetPropertyAsAUTF8String(u"uri"_ns, uri);
  attachment->SetPropertyAsBool(u"notDownloaded"_ns, notDownloaded);
  mAttachments.AppendElement(attachment);
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::AddAttachmentFieldFromMIME(const nsACString& field,
                                          const nsACString& value) {
  nsIWritablePropertyBag2* attachment = mAttachments.LastElement();
  attachment->SetPropertyAsAUTF8String(NS_ConvertUTF8toUTF16(field), value);
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetAttachments(
    nsTArray<RefPtr<nsIPropertyBag2> >& aAttachments) {
  aAttachments.Clear();
  for (nsIWritablePropertyBag2* attachment : mAttachments) {
    aAttachments.AppendElement(static_cast<nsIPropertyBag2*>(attachment));
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetMailCharacterSet(nsACString& aMailCharacterSet) {
  aMailCharacterSet = mMailCharacterSet;
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::SetMailCharacterSet(const nsACString& aMailCharacterSet) {
  mMailCharacterSet = aMailCharacterSet;

  // Convert to a canonical charset name instead of using the charset name from
  // the message header as is. This is needed for charset menu item to have a
  // check mark correctly.
  nsresult rv;
  nsCOMPtr<nsICharsetConverterManager> ccm =
      do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return ccm->GetCharsetAlias(PromiseFlatCString(aMailCharacterSet).get(),
                              mMailCharacterSet);
}

NS_IMETHODIMP
nsMailChannel::GetImipMethod(nsACString& aImipMethod) {
  aImipMethod = mImipMethod;
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::SetImipMethod(const nsACString& aImipMethod) {
  mImipMethod = aImipMethod;
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetImipItem(calIItipItem** aImipItem) {
  NS_IF_ADDREF(*aImipItem = mImipItem);
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::SetImipItem(calIItipItem* aImipItem) {
  mImipItem = aImipItem;
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetSmimeHeaderSink(nsIMsgSMIMEHeaderSink** aSmimeHeaderSink) {
  NS_IF_ADDREF(*aSmimeHeaderSink = mSmimeHeaderSink);
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::SetSmimeHeaderSink(nsIMsgSMIMEHeaderSink* aSmimeHeaderSink) {
  mSmimeHeaderSink = aSmimeHeaderSink;
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::GetListener(nsIMailProgressListener** aListener) {
  nsCOMPtr<nsIMailProgressListener> listener = do_QueryReferent(mListener);
  if (listener) {
    NS_IF_ADDREF(*aListener = listener);
  } else {
    *aListener = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMailChannel::SetListener(nsIMailProgressListener* aListener) {
  nsresult rv;
  mListener = do_GetWeakReference(aListener, &rv);
  return rv;
}

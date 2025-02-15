/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgAttachment.h"
#include "nsIFile.h"
#include "nsNetUtil.h"
#include "nsMsgCompUtils.h"

NS_IMPL_ISUPPORTS(nsMsgAttachment, nsIMsgAttachment)

nsMsgAttachment::nsMsgAttachment() {
  mTemporary = false;
  mSendViaCloud = false;
  mSize = -1;
}

nsMsgAttachment::~nsMsgAttachment() {
  MOZ_LOG(Compose, mozilla::LogLevel::Debug, ("~nsMsgAttachment()"));
}

/* attribute wstring name; */
NS_IMETHODIMP nsMsgAttachment::GetName(nsACString& aName) {
  aName = mName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetName(const nsACString& aName) {
  mName = aName;
  return NS_OK;
}

/* attribute string url; */
NS_IMETHODIMP nsMsgAttachment::GetUrl(nsACString& aUrl) {
  aUrl = mUrl;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetUrl(const nsACString& aUrl) {
  mUrl = aUrl;
  return NS_OK;
}

/* attribute string msgUri; */
NS_IMETHODIMP nsMsgAttachment::GetMsgUri(nsACString& aMsgUri) {
  aMsgUri = mMsgUri;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetMsgUri(const nsACString& aMsgUri) {
  mMsgUri = aMsgUri;
  return NS_OK;
}

/* attribute string urlCharset; */
NS_IMETHODIMP nsMsgAttachment::GetUrlCharset(nsACString& aUrlCharset) {
  aUrlCharset = mUrlCharset;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetUrlCharset(const nsACString& aUrlCharset) {
  mUrlCharset = aUrlCharset;
  return NS_OK;
}

/* attribute boolean temporary; */
NS_IMETHODIMP nsMsgAttachment::GetTemporary(bool* aTemporary) {
  NS_ENSURE_ARG_POINTER(aTemporary);

  *aTemporary = mTemporary;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetTemporary(bool aTemporary) {
  mTemporary = aTemporary;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetSendViaCloud(bool* aSendViaCloud) {
  NS_ENSURE_ARG_POINTER(aSendViaCloud);

  *aSendViaCloud = mSendViaCloud;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetSendViaCloud(bool aSendViaCloud) {
  mSendViaCloud = aSendViaCloud;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetHtmlAnnotation(
    const nsACString& aAnnotation) {
  mHtmlAnnotation = aAnnotation;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetHtmlAnnotation(nsACString& aAnnotation) {
  aAnnotation = mHtmlAnnotation;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAttachment::SetCloudFileAccountKey(
    const nsACString& aCloudFileAccountKey) {
  mCloudFileAccountKey = aCloudFileAccountKey;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAttachment::GetCloudFileAccountKey(nsACString& aCloudFileAccountKey) {
  aCloudFileAccountKey = mCloudFileAccountKey;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetCloudPartHeaderData(
    nsACString& aCloudPartHeaderData) {
  aCloudPartHeaderData = mCloudPartHeaderData;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetCloudPartHeaderData(
    const nsACString& aCloudPartHeaderData) {
  mCloudPartHeaderData = aCloudPartHeaderData;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetContentLocation(
    nsACString& aContentLocation) {
  aContentLocation = mContentLocation;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetContentLocation(
    const nsACString& aContentLocation) {
  mContentLocation = aContentLocation;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetContentType(nsACString& aContentType) {
  aContentType = mContentType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetContentType(const nsACString& aContentType) {
  mContentType = aContentType;
  // a full content type could also contains parameters but we need to
  // keep only the content type alone. Therefore we need to cleanup it.
  int32_t offset = mContentType.FindChar(';');
  if (offset >= 0) mContentType.SetLength(offset);

  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetContentTypeParam(
    nsACString& aContentTypeParam) {
  aContentTypeParam = mContentTypeParam;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetContentTypeParam(
    const nsACString& aContentTypeParam) {
  if (!aContentTypeParam.IsEmpty()) {
    nsCString contentTypeParam(aContentTypeParam);
    const char* ctp = contentTypeParam.get();
    while (*ctp == ';' || *ctp == ' ') {
      ctp++;
    }
    mContentTypeParam = nsDependentCString(ctp);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetContentId(nsACString& aContentId) {
  aContentId = mContentId;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::SetContentId(const nsACString& aContentId) {
  mContentId = aContentId;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetCharset(nsACString& aCharset) {
  aCharset = mCharset;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetCharset(const nsACString& aCharset) {
  mCharset = aCharset;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetMacType(nsACString& aMacType) {
  aMacType = mMacType;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetMacType(const nsACString& aMacType) {
  mMacType = aMacType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachment::GetMacCreator(nsACString& aMacCreator) {
  aMacCreator = mMacCreator;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetMacCreator(const nsACString& aMacCreator) {
  mMacCreator = aMacCreator;
  return NS_OK;
}

/* attribute int64_t size; */
NS_IMETHODIMP nsMsgAttachment::GetSize(int64_t* aSize) {
  NS_ENSURE_ARG_POINTER(aSize);

  *aSize = mSize;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachment::SetSize(int64_t aSize) {
  mSize = aSize;
  return NS_OK;
}

/* boolean equalsUrl (in nsIMsgAttachment attachment); */
NS_IMETHODIMP nsMsgAttachment::EqualsUrl(nsIMsgAttachment* attachment,
                                         bool* _retval) {
  NS_ENSURE_ARG_POINTER(attachment);
  NS_ENSURE_ARG_POINTER(_retval);

  nsAutoCString url;
  attachment->GetUrl(url);

  *_retval = mUrl.Equals(url);
  return NS_OK;
}

nsresult nsMsgAttachment::DeleteAttachment() {
  nsresult rv;
  bool isAFile = false;

  nsCOMPtr<nsIFile> urlFile;
  rv = NS_GetFileFromURLSpec(mUrl, getter_AddRefs(urlFile));
  NS_ASSERTION(NS_SUCCEEDED(rv), "Can't nsIFile from URL string");
  if (NS_SUCCEEDED(rv)) {
    bool bExists = false;
    rv = urlFile->Exists(&bExists);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Exists() call failed!");
    if (NS_SUCCEEDED(rv) && bExists) {
      rv = urlFile->IsFile(&isAFile);
      NS_ASSERTION(NS_SUCCEEDED(rv), "IsFile() call failed!");
    }
  }

  // remove it if it's a valid file
  if (isAFile) rv = urlFile->Remove(false);

  return rv;
}

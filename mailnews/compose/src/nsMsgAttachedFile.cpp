/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIMsgSend.h"
#include "nsIURI.h"
#include "nsMsgAttachmentData.h"

NS_IMPL_ISUPPORTS(nsMsgAttachedFile, nsIMsgAttachedFile)

nsMsgAttachedFile::nsMsgAttachedFile() {}

nsMsgAttachedFile::~nsMsgAttachedFile() {}

NS_IMETHODIMP nsMsgAttachedFile::GetOrigUrl(nsIURI** aOrigUrl) {
  NS_ENSURE_ARG_POINTER(aOrigUrl);
  NS_IF_ADDREF(*aOrigUrl = m_origUrl);
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetOrigUrl(nsIURI* aOrigUrl) {
  m_origUrl = aOrigUrl;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetTmpFile(nsIFile** aTmpFile) {
  NS_ENSURE_ARG_POINTER(aTmpFile);
  NS_IF_ADDREF(*aTmpFile = m_tmpFile);
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetTmpFile(nsIFile* aTmpFile) {
  m_tmpFile = aTmpFile;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetType(nsACString& aType) {
  aType = m_type;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetType(const nsACString& aType) {
  m_type = aType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetEncoding(nsACString& aEncoding) {
  aEncoding = m_encoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetEncoding(const nsACString& aEncoding) {
  m_encoding = aEncoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetDescription(nsACString& aDescription) {
  aDescription = m_description;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetDescription(
    const nsACString& aDescription) {
  m_description = aDescription;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetCloudPartInfo(nsACString& aCloudPartInfo) {
  aCloudPartInfo = m_cloudPartInfo;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetCloudPartInfo(
    const nsACString& aCloudPartInfo) {
  m_cloudPartInfo = aCloudPartInfo;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetXMacCreator(nsACString& aXMacCreator) {
  aXMacCreator = m_xMacCreator;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetXMacCreator(
    const nsACString& aXMacCreator) {
  m_xMacCreator = aXMacCreator;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetRealName(nsACString& aRealName) {
  aRealName = m_realName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetRealName(const nsACString& aRealName) {
  m_realName = aRealName;
  return NS_OK;
}

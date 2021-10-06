/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsMsgAttachedFile.h"

NS_IMPL_ISUPPORTS(nsMsgAttachedFile, nsIMsgAttachedFile)

nsMsgAttachedFile::nsMsgAttachedFile()
    : m_size(0),
      m_unprintableCount(0),
      m_highbitCount(0),
      m_ctlCount(0),
      m_nullCount(0),
      m_maxLineLength(0) {}

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

NS_IMETHODIMP nsMsgAttachedFile::GetXMacType(nsACString& aXMacType) {
  aXMacType = m_xMacType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetXMacType(const nsACString& aXMacType) {
  m_xMacType = aXMacType;
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

NS_IMETHODIMP nsMsgAttachedFile::GetSize(uint32_t* aSize) {
  NS_ENSURE_ARG_POINTER(aSize);
  *aSize = m_size;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetSize(uint32_t aSize) {
  m_size = aSize;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetUnprintableCount(
    uint32_t* aUnprintableCount) {
  NS_ENSURE_ARG_POINTER(aUnprintableCount);
  *aUnprintableCount = m_unprintableCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetUnprintableCount(
    uint32_t aUnprintableCount) {
  m_unprintableCount = aUnprintableCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetHighbitCount(uint32_t* aHighbitCount) {
  NS_ENSURE_ARG_POINTER(aHighbitCount);
  *aHighbitCount = m_highbitCount;
  return NS_OK;
}
NS_IMETHODIMP nsMsgAttachedFile::SetHighbitCount(uint32_t aHighbitCount) {
  m_highbitCount = aHighbitCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetCtlCount(uint32_t* aCtlCount) {
  NS_ENSURE_ARG_POINTER(aCtlCount);
  *aCtlCount = m_ctlCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetCtlCount(uint32_t aCtlCount) {
  m_ctlCount = aCtlCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetNullCount(uint32_t* aNullCount) {
  NS_ENSURE_ARG_POINTER(aNullCount);
  *aNullCount = m_nullCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetNullCount(uint32_t aNullCount) {
  m_nullCount = aNullCount;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::GetMaxLineLength(uint32_t* aMaxLineLength) {
  NS_ENSURE_ARG_POINTER(aMaxLineLength);
  *aMaxLineLength = m_maxLineLength;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachedFile::SetMaxLineLength(uint32_t aMaxLineLength) {
  m_maxLineLength = aMaxLineLength;
  return NS_OK;
}

/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsMsgAttachmentData.h"

NS_IMPL_ISUPPORTS(nsMsgAttachmentData, nsIMsgAttachmentData)

nsMsgAttachmentData::nsMsgAttachmentData()
    : m_size(0),
      m_sizeExternalStr("-1"),
      m_isExternalAttachment(false),
      m_isExternalLinkAttachment(false),
      m_isDownloaded(false),
      m_hasFilename(false),
      m_displayableInline(false) {}

nsMsgAttachmentData::~nsMsgAttachmentData() {}

NS_IMETHODIMP nsMsgAttachmentData::GetUrl(nsIURI** aUrl) {
  NS_ENSURE_ARG_POINTER(aUrl);
  NS_IF_ADDREF(*aUrl = m_url);
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetUrl(nsIURI* aUrl) {
  m_url = aUrl;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetDesiredType(nsACString& aDesiredType) {
  aDesiredType = m_desiredType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetDesiredType(
    const nsACString& aDesiredType) {
  m_desiredType = aDesiredType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetRealType(nsACString& aRealType) {
  aRealType = m_realType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetRealType(const nsACString& aRealType) {
  m_realType = aRealType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetRealEncoding(nsACString& aRealEncoding) {
  aRealEncoding = m_realEncoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetRealEncoding(
    const nsACString& aRealEncoding) {
  m_realEncoding = aRealEncoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetRealName(nsACString& aRealName) {
  aRealName = m_realName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetRealName(const nsACString& aRealName) {
  m_realName = aRealName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetDescription(nsACString& aDescription) {
  aDescription = m_description;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetDescription(
    const nsACString& aDescription) {
  m_description = aDescription;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetXMacType(nsACString& aXMacType) {
  aXMacType = m_xMacType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetXMacType(const nsACString& aXMacType) {
  m_xMacType = aXMacType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::GetXMacCreator(nsACString& aXMacCreator) {
  aXMacCreator = m_xMacCreator;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAttachmentData::SetXMacCreator(
    const nsACString& aXMacCreator) {
  m_xMacCreator = aXMacCreator;
  return NS_OK;
}

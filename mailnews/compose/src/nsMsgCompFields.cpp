/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCompFields.h"
#include "nsIMsgCompose.h"
#include "nsMsgCompUtils.h"
#include "nsMsgUtils.h"
#include "prmem.h"
#include "nsIMsgAttachment.h"
#include "nsIMsgMdnGenerator.h"
#include "mozilla/ArrayUtils.h"
#include "mozilla/mailnews/MimeHeaderParser.h"

using namespace mozilla::mailnews;

struct HeaderInfo {
  /// Header name
  const char* mName;
  /// If true, nsMsgCompFields should reflect the raw header value instead of
  /// the unstructured header value.
  bool mStructured;
};

// This is a mapping of the m_headers local set to the actual header name we
// store on the structured header object.
static HeaderInfo kHeaders[] = {
    {"From", true},
    {"Reply-To", true},
    {"To", true},
    {"Cc", true},
    {"Bcc", true},
    {nullptr, false},  // FCC
    {nullptr, false},  // FCC2
    {"Newsgroups", true},
    {"Followup-To", true},
    {"Subject", false},
    {"Organization", false},
    {"References", true},
    {"X-Mozilla-News-Host", false},
    {"X-Priority", false},
    {nullptr, false},  // CHARACTER_SET
    {"Message-Id", true},
    {"X-Template", true},
    {nullptr, false},  // DRAFT_ID
    {nullptr, false},  // TEMPLATE_ID
    {"Content-Language", true},
    {nullptr, false}  // CREATOR IDENTITY KEY
};

static_assert(
    MOZ_ARRAY_LENGTH(kHeaders) == nsMsgCompFields::MSG_MAX_HEADERS,
    "These two arrays need to be kept in sync or bad things will happen!");

NS_IMPL_ISUPPORTS(nsMsgCompFields, nsIMsgCompFields, msgIStructuredHeaders,
                  msgIWritableStructuredHeaders)

nsMsgCompFields::nsMsgCompFields()
    : mStructuredHeaders(do_CreateInstance(NS_ISTRUCTUREDHEADERS_CONTRACTID)) {
  m_body.Truncate();

  m_attachVCard = false;
  m_forcePlainText = false;
  m_useMultipartAlternative = false;
  m_returnReceipt = false;
  m_receiptHeaderType = nsIMsgMdnGenerator::eDntType;
  m_DSN = false;
  m_bodyIsAsciiOnly = false;
  m_forceMsgEncoding = false;
  m_needToCheckCharset = true;
  m_attachmentReminder = false;
  m_deliveryFormat = nsIMsgCompSendFormat::Unset;
}

nsMsgCompFields::~nsMsgCompFields() {
  MOZ_LOG(Compose, mozilla::LogLevel::Debug, ("~nsMsgCompFields()"));
}

nsresult nsMsgCompFields::SetAsciiHeader(MsgHeaderID header,
                                         const char* value) {
  NS_ASSERTION(header >= 0 && header < MSG_MAX_HEADERS,
               "Invalid message header index!");

  // If we are storing this on the structured header object, we need to set the
  // value on that object as well. Note that the value may be null, which we'll
  // take as an attempt to delete the header.
  const char* headerName = kHeaders[header].mName;
  if (headerName) {
    if (!value || !*value) return mStructuredHeaders->DeleteHeader(headerName);

    return mStructuredHeaders->SetRawHeader(headerName,
                                            nsDependentCString(value));
  }

  // Not on the structurd header object, so save it locally.
  m_headers[header] = value;

  return NS_OK;
}

const char* nsMsgCompFields::GetAsciiHeader(MsgHeaderID header) {
  NS_ASSERTION(header >= 0 && header < MSG_MAX_HEADERS,
               "Invalid message header index!");

  const char* headerName = kHeaders[header].mName;
  if (headerName) {
    // We may be out of sync with the structured header object. Retrieve the
    // header value.
    if (kHeaders[header].mStructured) {
      mStructuredHeaders->GetRawHeader(headerName, m_headers[header]);
    } else {
      nsString value;
      mStructuredHeaders->GetUnstructuredHeader(headerName, value);
      CopyUTF16toUTF8(value, m_headers[header]);
    }
  }

  return m_headers[header].get();
}

nsresult nsMsgCompFields::SetUnicodeHeader(MsgHeaderID header,
                                           const nsAString& value) {
  return SetAsciiHeader(header, NS_ConvertUTF16toUTF8(value).get());
}

nsresult nsMsgCompFields::GetUnicodeHeader(MsgHeaderID header,
                                           nsAString& aResult) {
  CopyUTF8toUTF16(nsDependentCString(GetAsciiHeader(header)), aResult);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetFrom(const nsAString& value) {
  return SetUnicodeHeader(MSG_FROM_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetFrom(nsAString& _retval) {
  return GetUnicodeHeader(MSG_FROM_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetReplyTo(const nsAString& value) {
  return SetUnicodeHeader(MSG_REPLY_TO_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetReplyTo(nsAString& _retval) {
  return GetUnicodeHeader(MSG_REPLY_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetTo(const nsAString& value) {
  return SetUnicodeHeader(MSG_TO_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetTo(nsAString& _retval) {
  return GetUnicodeHeader(MSG_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetCc(const nsAString& value) {
  return SetUnicodeHeader(MSG_CC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetCc(nsAString& _retval) {
  return GetUnicodeHeader(MSG_CC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetBcc(const nsAString& value) {
  return SetUnicodeHeader(MSG_BCC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetBcc(nsAString& _retval) {
  return GetUnicodeHeader(MSG_BCC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetFcc(const nsAString& value) {
  return SetUnicodeHeader(MSG_FCC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetFcc(nsAString& _retval) {
  return GetUnicodeHeader(MSG_FCC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetFcc2(const nsAString& value) {
  return SetUnicodeHeader(MSG_FCC2_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetFcc2(nsAString& _retval) {
  return GetUnicodeHeader(MSG_FCC2_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetNewsgroups(const nsAString& aValue) {
  return SetUnicodeHeader(MSG_NEWSGROUPS_HEADER_ID, aValue);
}

NS_IMETHODIMP nsMsgCompFields::GetNewsgroups(nsAString& aGroup) {
  return GetUnicodeHeader(MSG_NEWSGROUPS_HEADER_ID, aGroup);
}

NS_IMETHODIMP nsMsgCompFields::SetFollowupTo(const nsAString& aValue) {
  return SetUnicodeHeader(MSG_FOLLOWUP_TO_HEADER_ID, aValue);
}

NS_IMETHODIMP nsMsgCompFields::GetFollowupTo(nsAString& _retval) {
  return GetUnicodeHeader(MSG_FOLLOWUP_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::GetHasRecipients(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = NS_SUCCEEDED(mime_sanity_check_fields_recipients(
      GetTo(), GetCc(), GetBcc(), GetNewsgroups()));

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetCreatorIdentityKey(const char* value) {
  return SetAsciiHeader(MSG_CREATOR_IDENTITY_KEY_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetCreatorIdentityKey(char** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = strdup(GetAsciiHeader(MSG_CREATOR_IDENTITY_KEY_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetSubject(const nsAString& value) {
  return SetUnicodeHeader(MSG_SUBJECT_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetSubject(nsAString& _retval) {
  return GetUnicodeHeader(MSG_SUBJECT_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetOrganization(const nsAString& value) {
  return SetUnicodeHeader(MSG_ORGANIZATION_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetOrganization(nsAString& _retval) {
  return GetUnicodeHeader(MSG_ORGANIZATION_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetReferences(const char* value) {
  return SetAsciiHeader(MSG_REFERENCES_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetReferences(char** _retval) {
  *_retval = strdup(GetAsciiHeader(MSG_REFERENCES_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetNewspostUrl(const char* value) {
  return SetAsciiHeader(MSG_NEWSPOSTURL_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetNewspostUrl(char** _retval) {
  *_retval = strdup(GetAsciiHeader(MSG_NEWSPOSTURL_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetPriority(const char* value) {
  return SetAsciiHeader(MSG_PRIORITY_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetPriority(char** _retval) {
  *_retval = strdup(GetAsciiHeader(MSG_PRIORITY_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetMessageId(const char* value) {
  return SetAsciiHeader(MSG_MESSAGE_ID_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetMessageId(char** _retval) {
  *_retval = strdup(GetAsciiHeader(MSG_MESSAGE_ID_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetTemplateName(const nsAString& value) {
  return SetUnicodeHeader(MSG_X_TEMPLATE_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetTemplateName(nsAString& _retval) {
  return GetUnicodeHeader(MSG_X_TEMPLATE_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetDraftId(const nsACString& value) {
  return SetAsciiHeader(MSG_DRAFT_ID_HEADER_ID,
                        PromiseFlatCString(value).get());
}

NS_IMETHODIMP nsMsgCompFields::GetDraftId(nsACString& _retval) {
  _retval.Assign(GetAsciiHeader(MSG_DRAFT_ID_HEADER_ID));
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetTemplateId(const nsACString& value) {
  return SetAsciiHeader(MSG_TEMPLATE_ID_HEADER_ID,
                        PromiseFlatCString(value).get());
}

NS_IMETHODIMP nsMsgCompFields::GetTemplateId(nsACString& _retval) {
  _retval.Assign(GetAsciiHeader(MSG_TEMPLATE_ID_HEADER_ID));
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetReturnReceipt(bool value) {
  m_returnReceipt = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetReturnReceipt(bool* _retval) {
  *_retval = m_returnReceipt;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetReceiptHeaderType(int32_t value) {
  m_receiptHeaderType = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetReceiptHeaderType(int32_t* _retval) {
  *_retval = m_receiptHeaderType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetDSN(bool value) {
  m_DSN = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetDSN(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_DSN;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetAttachVCard(bool value) {
  m_attachVCard = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetAttachVCard(bool* _retval) {
  *_retval = m_attachVCard;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetAttachmentReminder(bool* _retval) {
  *_retval = m_attachmentReminder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetAttachmentReminder(bool value) {
  m_attachmentReminder = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetDeliveryFormat(int32_t value) {
  switch (value) {
    case nsIMsgCompSendFormat::Auto:
    case nsIMsgCompSendFormat::PlainText:
    case nsIMsgCompSendFormat::HTML:
    case nsIMsgCompSendFormat::Both:
      m_deliveryFormat = value;
      break;
    case nsIMsgCompSendFormat::Unset:
    default:
      m_deliveryFormat = nsIMsgCompSendFormat::Unset;
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetDeliveryFormat(int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_deliveryFormat;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetContentLanguage(const char* value) {
  return SetAsciiHeader(MSG_CONTENT_LANGUAGE_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetContentLanguage(char** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = strdup(GetAsciiHeader(MSG_CONTENT_LANGUAGE_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetForcePlainText(bool value) {
  m_forcePlainText = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetForcePlainText(bool* _retval) {
  *_retval = m_forcePlainText;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetForceMsgEncoding(bool value) {
  m_forceMsgEncoding = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetForceMsgEncoding(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_forceMsgEncoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetUseMultipartAlternative(bool value) {
  m_useMultipartAlternative = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetUseMultipartAlternative(bool* _retval) {
  *_retval = m_useMultipartAlternative;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetBodyIsAsciiOnly(bool value) {
  m_bodyIsAsciiOnly = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetBodyIsAsciiOnly(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = m_bodyIsAsciiOnly;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetBody(const nsAString& value) {
  m_body = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetBody(nsAString& _retval) {
  _retval = m_body;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetAttachments(
    nsTArray<RefPtr<nsIMsgAttachment>>& attachments) {
  attachments = m_attachments.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::AddAttachment(nsIMsgAttachment* attachment) {
  // Don't add the same attachment twice.
  for (nsIMsgAttachment* a : m_attachments) {
    bool sameUrl;
    a->EqualsUrl(attachment, &sameUrl);
    if (sameUrl) return NS_OK;
  }
  m_attachments.AppendElement(attachment);
  return NS_OK;
}

/* void removeAttachment (in nsIMsgAttachment attachment); */
NS_IMETHODIMP nsMsgCompFields::RemoveAttachment(nsIMsgAttachment* attachment) {
  for (uint32_t i = 0; i < m_attachments.Length(); i++) {
    bool sameUrl;
    m_attachments[i]->EqualsUrl(attachment, &sameUrl);
    if (sameUrl) {
      m_attachments.RemoveElementAt(i);
      break;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetOtherHeaders(
    const nsTArray<nsString>& headers) {
  m_otherHeaders = headers.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetOtherHeaders(nsTArray<nsString>& headers) {
  headers = m_otherHeaders.Clone();
  return NS_OK;
}

/* void removeAttachments (); */
NS_IMETHODIMP nsMsgCompFields::RemoveAttachments() {
  m_attachments.Clear();
  return NS_OK;
}

// This method is called during the creation of a new window.
NS_IMETHODIMP
nsMsgCompFields::SplitRecipients(const nsAString& aRecipients,
                                 bool aEmailAddressOnly,
                                 nsTArray<nsString>& aResult) {
  nsCOMArray<msgIAddressObject> header(EncodedHeaderW(aRecipients));
  if (aEmailAddressOnly)
    ExtractEmails(header, aResult);
  else
    ExtractDisplayAddresses(header, aResult);

  return NS_OK;
}

// This method is called during the sending of message from
// nsMsgCompose::CheckAndPopulateRecipients()
nsresult nsMsgCompFields::SplitRecipientsEx(const nsAString& recipients,
                                            nsTArray<nsMsgRecipient>& aResult) {
  nsTArray<nsString> names, addresses;
  ExtractAllAddresses(EncodedHeaderW(recipients), names, addresses);

  uint32_t numAddresses = names.Length();
  for (uint32_t i = 0; i < numAddresses; ++i) {
    nsMsgRecipient msgRecipient;
    msgRecipient.mEmail = addresses[i];
    msgRecipient.mName = names[i];
    aResult.AppendElement(msgRecipient);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::ConvertBodyToPlainText() {
  nsresult rv = NS_OK;

  if (!m_body.IsEmpty()) {
    if (NS_SUCCEEDED(rv)) {
      bool flowed, formatted;
      GetSerialiserFlags(&flowed, &formatted);
      rv = ConvertBufToPlainText(m_body, flowed, formatted, true);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgCompFields::GetComposeSecure(
    nsIMsgComposeSecure** aComposeSecure) {
  NS_ENSURE_ARG_POINTER(aComposeSecure);
  NS_IF_ADDREF(*aComposeSecure = mSecureCompFields);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetComposeSecure(
    nsIMsgComposeSecure* aComposeSecure) {
  mSecureCompFields = aComposeSecure;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetNeedToCheckCharset(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_needToCheckCharset;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetNeedToCheckCharset(bool aCheck) {
  m_needToCheckCharset = aCheck;
  return NS_OK;
}

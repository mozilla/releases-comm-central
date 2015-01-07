/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCompFields.h"
#include "nsMsgI18N.h"
#include "nsMsgCompUtils.h"
#include "nsMsgUtils.h"
#include "prmem.h"
#include "nsIFileChannel.h"
#include "nsIMsgAttachment.h"
#include "nsIMsgMdnGenerator.h"
#include "nsServiceManagerUtils.h"
#include "nsMsgMimeCID.h"
#include "nsArrayEnumerator.h"
#include "nsMemory.h"
#include "mozilla/ArrayUtils.h"
#include "mozilla/mailnews/MimeHeaderParser.h"

using namespace mozilla::mailnews;

struct HeaderInfo {
  /// Header name
  const char *mName;
  /// If true, nsMsgCompFields should reflect the raw header value instead of
  /// the unstructured header value.
  bool mStructured;
};

// This is a mapping of the m_headers local set to the actual header name we
// store on the structured header object.
static HeaderInfo kHeaders[] = {
  { "From", true },
  { "Reply-To", true },
  { "To", true },
  { "Cc", true },
  { "Bcc", true },
  { nullptr, false },
  { nullptr, false },
  { "Newsgroups", true },
  { "Followup-To", true },
  { "Subject", false },
  { "Organization", false },
  { "References", true },
  { "X-Mozilla-News-Host", false },
  { "X-Priority", false },
  { nullptr, false },
  { "Message-Id", true },
  { "X-Template", true },
  { nullptr, false }
};

static_assert(MOZ_ARRAY_LENGTH(kHeaders) ==
    nsMsgCompFields::MSG_MAX_HEADERS,
  "These two arrays need to be kept in sync or bad things will happen!");

NS_IMPL_ISUPPORTS(nsMsgCompFields, nsIMsgCompFields, msgIStructuredHeaders,
  msgIWritableStructuredHeaders)
 
nsMsgCompFields::nsMsgCompFields()
: mStructuredHeaders(do_CreateInstance(NS_ISTRUCTUREDHEADERS_CONTRACTID))
{
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

  // Get the default charset from pref, use this as a mail charset.
  nsString charset;
  NS_GetLocalizedUnicharPreferenceWithDefault(nullptr, "mailnews.send_default_charset",
                                              NS_LITERAL_STRING("UTF-8"), charset);

  LossyCopyUTF16toASCII(charset, m_DefaultCharacterSet); // Charsets better be ASCII
  SetCharacterSet(m_DefaultCharacterSet.get());
}

nsMsgCompFields::~nsMsgCompFields()
{
}

nsresult nsMsgCompFields::SetAsciiHeader(MsgHeaderID header, const char *value)
{
  NS_ASSERTION(header >= 0 && header < MSG_MAX_HEADERS,
               "Invalid message header index!");

  // If we are storing this on the structured header object, we need to set the
  // value on that object as well. Note that the value may be null, which we'll
  // take as an attempt to delete the header.
  const char *headerName = kHeaders[header].mName;
  if (headerName)
  {
    if (!value || !*value)
      return mStructuredHeaders->DeleteHeader(headerName);

    return mStructuredHeaders->SetRawHeader(headerName,
      nsDependentCString(value), "UTF-8");
  }

  // Not on the structurd header object, so save it locally.
  m_headers[header] = value;

  return NS_OK;
}

const char* nsMsgCompFields::GetAsciiHeader(MsgHeaderID header)
{
  NS_ASSERTION(header >= 0 && header < MSG_MAX_HEADERS,
               "Invalid message header index!");

  const char *headerName = kHeaders[header].mName;
  if (headerName)
  {
    // We may be out of sync with the structured header object. Retrieve the
    // header value.
    if (kHeaders[header].mStructured)
    {
      mStructuredHeaders->GetRawHeader(headerName, m_headers[header]);
    }
    else
    {
      nsString value;
      mStructuredHeaders->GetUnstructuredHeader(headerName, value);
      CopyUTF16toUTF8(value, m_headers[header]);
    }
  }

  return m_headers[header].get();
}

nsresult nsMsgCompFields::SetUnicodeHeader(MsgHeaderID header, const nsAString& value)
{
  return SetAsciiHeader(header, NS_ConvertUTF16toUTF8(value).get());
}

nsresult nsMsgCompFields::GetUnicodeHeader(MsgHeaderID header, nsAString& aResult)
{
  CopyUTF8toUTF16(nsDependentCString(GetAsciiHeader(header)), aResult);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetFrom(const nsAString &value)
{
  return SetUnicodeHeader(MSG_FROM_HEADER_ID, value);
}


NS_IMETHODIMP nsMsgCompFields::GetFrom(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_FROM_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetReplyTo(const nsAString &value)
{
  return SetUnicodeHeader(MSG_REPLY_TO_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetReplyTo(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_REPLY_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetTo(const nsAString &value)
{
  return SetUnicodeHeader(MSG_TO_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetTo(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetCc(const nsAString &value)
{
  return SetUnicodeHeader(MSG_CC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetCc(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_CC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetBcc(const nsAString &value)
{
  return SetUnicodeHeader(MSG_BCC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetBcc(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_BCC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetFcc(const nsAString &value)
{
  return SetUnicodeHeader(MSG_FCC_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetFcc(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_FCC_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetFcc2(const nsAString &value)
{
  return SetUnicodeHeader(MSG_FCC2_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetFcc2(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_FCC2_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetNewsgroups(const nsAString &aValue)
{
  return SetUnicodeHeader(MSG_NEWSGROUPS_HEADER_ID, aValue);
}

NS_IMETHODIMP nsMsgCompFields::GetNewsgroups(nsAString &aGroup)
{
  return GetUnicodeHeader(MSG_NEWSGROUPS_HEADER_ID, aGroup);
}

NS_IMETHODIMP nsMsgCompFields::SetFollowupTo(const nsAString &aValue)
{
  return SetUnicodeHeader(MSG_FOLLOWUP_TO_HEADER_ID, aValue);
}

NS_IMETHODIMP nsMsgCompFields::GetFollowupTo(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_FOLLOWUP_TO_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::GetHasRecipients(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = NS_SUCCEEDED(mime_sanity_check_fields_recipients(
    GetTo(), GetCc(), GetBcc(), GetNewsgroups()));

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetSubject(const nsAString &value)
{
  return SetUnicodeHeader(MSG_SUBJECT_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetSubject(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_SUBJECT_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetOrganization(const nsAString &value)
{
  return SetUnicodeHeader(MSG_ORGANIZATION_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetOrganization(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_ORGANIZATION_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetReferences(const char *value)
{
  return SetAsciiHeader(MSG_REFERENCES_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetReferences(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_REFERENCES_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetNewspostUrl(const char *value)
{
  return SetAsciiHeader(MSG_NEWSPOSTURL_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetNewspostUrl(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_NEWSPOSTURL_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetPriority(const char *value)
{
  return SetAsciiHeader(MSG_PRIORITY_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetPriority(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_PRIORITY_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetCharacterSet(const char *value)
{
  return SetAsciiHeader(MSG_CHARACTER_SET_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetCharacterSet(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_CHARACTER_SET_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetMessageId(const char *value)
{
  return SetAsciiHeader(MSG_MESSAGE_ID_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetMessageId(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_MESSAGE_ID_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetTemplateName(const nsAString &value)
{
  return SetUnicodeHeader(MSG_X_TEMPLATE_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetTemplateName(nsAString &_retval)
{
  return GetUnicodeHeader(MSG_X_TEMPLATE_HEADER_ID, _retval);
}

NS_IMETHODIMP nsMsgCompFields::SetDraftId(const char *value)
{
  return SetAsciiHeader(MSG_DRAFT_ID_HEADER_ID, value);
}

NS_IMETHODIMP nsMsgCompFields::GetDraftId(char **_retval)
{
  *_retval = strdup(GetAsciiHeader(MSG_DRAFT_ID_HEADER_ID));
  return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::SetReturnReceipt(bool value)
{
  m_returnReceipt = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetReturnReceipt(bool *_retval)
{
  *_retval = m_returnReceipt;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetReceiptHeaderType(int32_t value)
{
    m_receiptHeaderType = value;
    return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetReceiptHeaderType(int32_t *_retval)
{
    *_retval = m_receiptHeaderType;
    return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetDSN(bool value)
{
  m_DSN = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetDSN(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_DSN;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetAttachVCard(bool value)
{
  m_attachVCard = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetAttachVCard(bool *_retval)
{
  *_retval = m_attachVCard;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetAttachmentReminder(bool *_retval)
{
  *_retval = m_attachmentReminder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetAttachmentReminder(bool value)
{
  m_attachmentReminder = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetForcePlainText(bool value)
{
  m_forcePlainText = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetForcePlainText(bool *_retval)
{
  *_retval = m_forcePlainText;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetForceMsgEncoding(bool value)
{
  m_forceMsgEncoding = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetForceMsgEncoding(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_forceMsgEncoding;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetUseMultipartAlternative(bool value)
{
  m_useMultipartAlternative = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetUseMultipartAlternative(bool *_retval)
{
  *_retval = m_useMultipartAlternative;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetBodyIsAsciiOnly(bool value)
{
  m_bodyIsAsciiOnly = value;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetBodyIsAsciiOnly(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = m_bodyIsAsciiOnly;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetBody(const nsAString &value)
{
  CopyUTF16toUTF8(value, m_body);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetBody(nsAString &_retval)
{
  CopyUTF8toUTF16(m_body, _retval);
  return NS_OK;
}

nsresult nsMsgCompFields::SetBody(const char *value)
{
  if (value)
    m_body = value;
  else
    m_body.Truncate();
  return NS_OK;
}

const char* nsMsgCompFields::GetBody()
{
    return m_body.get();
}

/* readonly attribute nsISimpleEnumerator attachmentsArray; */
NS_IMETHODIMP nsMsgCompFields::GetAttachments(nsISimpleEnumerator * *aAttachmentsEnum)
{
  return aAttachmentsEnum ? NS_NewArrayEnumerator(aAttachmentsEnum, m_attachments) : NS_ERROR_NULL_POINTER;
}

/* void addAttachment (in nsIMsgAttachment attachment); */
NS_IMETHODIMP nsMsgCompFields::AddAttachment(nsIMsgAttachment *attachment)
{
  int32_t attachmentCount = m_attachments.Count();

  //Don't add twice the same attachment.
  nsCOMPtr<nsIMsgAttachment> element;
  bool sameUrl;
  for (int32_t i = 0; i < attachmentCount; i ++)
  {
    m_attachments[i]->EqualsUrl(attachment, &sameUrl);
    if (sameUrl)
      return NS_OK;
  }
  m_attachments.AppendObject(attachment);

  return NS_OK;
}

/* void removeAttachment (in nsIMsgAttachment attachment); */
NS_IMETHODIMP nsMsgCompFields::RemoveAttachment(nsIMsgAttachment *attachment)
{
  int32_t attachmentCount = m_attachments.Count();

  nsCOMPtr<nsIMsgAttachment> element;
  bool sameUrl;
  for (int32_t i = 0; i < attachmentCount; i ++)
  {
    m_attachments[i]->EqualsUrl(attachment, &sameUrl);
    if (sameUrl)
    {
      m_attachments.RemoveObjectAt(i);
      break;
    }
  }

  return NS_OK;
}

/* void removeAttachments (); */
NS_IMETHODIMP nsMsgCompFields::RemoveAttachments()
{
  m_attachments.Clear();

  return NS_OK;
}


// This method is called during the creation of a new window.
NS_IMETHODIMP
nsMsgCompFields::SplitRecipients(const nsAString &aRecipients,
                                 bool aEmailAddressOnly,
                                 uint32_t *aLength,
                                 char16_t*** aResult)
{
  NS_ENSURE_ARG_POINTER(aLength);
  NS_ENSURE_ARG_POINTER(aResult);

  *aLength = 0;
  *aResult = nullptr;

  nsCOMArray<msgIAddressObject> header(EncodedHeader(NS_ConvertUTF16toUTF8(aRecipients)));
  nsTArray<nsString> results;
  if (aEmailAddressOnly)
    ExtractEmails(header, results);
  else
    ExtractDisplayAddresses(header, results);

  uint32_t count = results.Length();
  char16_t **result = (char16_t **)NS_Alloc(sizeof(char16_t *) * count);
  for (uint32_t i = 0; i < count; ++i)
    result[i] = ToNewUnicode(results[i]);

  *aResult = result;
  *aLength = count;
  return NS_OK;
}


// This method is called during the sending of message from nsMsgCompose::CheckAndPopulateRecipients()
nsresult nsMsgCompFields::SplitRecipientsEx(const nsAString &recipients,
                                            nsTArray<nsMsgRecipient> &aResult)
{
  nsTArray<nsString> names, addresses;
  ExtractAllAddresses(EncodedHeader(NS_ConvertUTF16toUTF8(recipients)), names,
    addresses);

  uint32_t numAddresses = names.Length();
  for (uint32_t i = 0; i < numAddresses; ++i)
  {
    nsMsgRecipient msgRecipient;
    msgRecipient.mEmail = addresses[i];
    msgRecipient.mName = names[i];
    aResult.AppendElement(msgRecipient);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::ConvertBodyToPlainText()
{
  nsresult rv = NS_OK;

  if (!m_body.IsEmpty())
  {
    nsAutoString body;
    rv = GetBody(body);
    if (NS_SUCCEEDED(rv))
    {
      rv = ConvertBufToPlainText(body, UseFormatFlowed(GetCharacterSet()), true);
      if (NS_SUCCEEDED(rv))
        rv = SetBody(body);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgCompFields::GetSecurityInfo(nsISupports ** aSecurityInfo)
{
  NS_ENSURE_ARG_POINTER(aSecurityInfo);
  *aSecurityInfo = mSecureCompFields;
  NS_IF_ADDREF(*aSecurityInfo);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetSecurityInfo(nsISupports * aSecurityInfo)
{
  mSecureCompFields = aSecurityInfo;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::GetDefaultCharacterSet(char * *aDefaultCharacterSet)
{
  NS_ENSURE_ARG_POINTER(aDefaultCharacterSet);
  *aDefaultCharacterSet = ToNewCString(m_DefaultCharacterSet);
  return *aDefaultCharacterSet ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompFields::GetNeedToCheckCharset(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_needToCheckCharset;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompFields::SetNeedToCheckCharset(bool aCheck)
{
  m_needToCheckCharset = aCheck;
  return NS_OK;
}

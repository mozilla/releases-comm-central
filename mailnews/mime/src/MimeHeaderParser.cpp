/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/mailnews/Services.h"
#include "nsAutoPtr.h"
#include "nsCOMPtr.h"
#include "nsIMimeConverter.h"
#include "nsIMsgHeaderParser.h"
#include "nsMsgHeaderParser.h"

namespace mozilla {
namespace mailnews {

void detail::DoConversion(const nsTArray<nsString> &aUTF16Array,
                          nsTArray<nsCString> &aUTF8Array)
{
  uint32_t count = aUTF16Array.Length();
  aUTF8Array.SetLength(count);
  for (uint32_t i = 0; i < count; ++i)
    CopyUTF16toUTF8(aUTF16Array[i], aUTF8Array[i]);
}

void MakeMimeAddress(const nsACString &aName, const nsACString &aEmail,
                     nsACString &full)
{
  nsAutoString utf16Address;
  MakeMimeAddress(NS_ConvertUTF8toUTF16(aName), NS_ConvertUTF8toUTF16(aEmail),
                  utf16Address);

  CopyUTF16toUTF8(utf16Address, full);
}

void MakeMimeAddress(const nsAString &aName, const nsAString &aEmail,
                     nsAString &full)
{
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());

  headerParser->MakeMimeAddress(aName, aEmail, full);
}

void MakeDisplayAddress(const nsAString &aName, const nsAString &aEmail,
                        nsAString &full)
{
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());

  nsCOMPtr<msgIAddressObject> object;
  headerParser->MakeMailboxObject(aName, aEmail, getter_AddRefs(object));
  object->ToString(full);
}

void RemoveDuplicateAddresses(const nsACString &aHeader,
                              const nsACString &aOtherEmails,
                              nsACString &result)
{
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());

  headerParser->RemoveDuplicateAddresses(aHeader, aOtherEmails, result);
}

/////////////////////////////////////////////
// These are the core shim methods we need //
/////////////////////////////////////////////

ParsedHeader DecodedHeader(const nsAString &aHeader)
{
  ParsedHeader retval;
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());
  PRUnichar **rawNames = nullptr;
  PRUnichar **rawEmails = nullptr;
  PRUnichar **rawFull = nullptr;

  headerParser->ParseHeadersWithArray(PromiseFlatString(aHeader).get(),
    &rawEmails, &rawNames, &rawFull, &retval.mCount);

  retval.mAddresses = static_cast<msgIAddressObject**>(NS_Alloc(
    sizeof(msgIAddressObject*) * retval.mCount));

  for (uint32_t i = 0; i < retval.mCount; i++)
  {
    nsString clean;
    headerParser->UnquotePhraseOrAddrWString(rawNames[i], false,
      getter_Copies(clean));
    retval.mAddresses[i] = new MsgAddressObject(clean,
      nsDependentString(rawEmails[i]));
    NS_ADDREF(retval.mAddresses[i]);
  }

  NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(retval.mCount, rawNames);
  NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(retval.mCount, rawEmails);
  NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(retval.mCount, rawFull);
  return retval;
}

ParsedHeader EncodedHeader(const nsACString &aHeader, const char *aCharset)
{
  ParsedHeader retval;
  nsCOMPtr<nsIMsgHeaderParser> headerParser = services::GetHeaderParser();
  nsCOMPtr<nsIMimeConverter> converter = services::GetMimeConverter();

  nsCString nameBlob, emailBlob;
  headerParser->ParseHeaderAddresses(PromiseFlatCString(aHeader).get(),
    getter_Copies(nameBlob), getter_Copies(emailBlob), &retval.mCount);

  retval.mAddresses = static_cast<msgIAddressObject**>(NS_Alloc(
    sizeof(msgIAddressObject*) * retval.mCount));

  // The contract of ParseHeaderAddresses sucks: it's \0-delimited strings
  const char *namePtr = nameBlob.get();
  const char *emailPtr = emailBlob.get();
  for (uint32_t i = 0; i < retval.mCount; i++)
  {
    nsCString clean;
    nsString utf16Name;
    headerParser->UnquotePhraseOrAddr(namePtr, false, getter_Copies(clean));
    converter->DecodeMimeHeader(clean.get(), aCharset, false, true, utf16Name);
    retval.mAddresses[i] = new MsgAddressObject(utf16Name,
      NS_ConvertUTF8toUTF16(emailPtr));
    NS_ADDREF(retval.mAddresses[i]);

    // Go past the \0 to the next one
    namePtr += strlen(namePtr) + 1;
    emailPtr += strlen(emailPtr) + 1;
  }
  return retval;
}

ParsedHeader::~ParsedHeader()
{
  if (mAddresses)
    NS_FREE_XPCOM_ISUPPORTS_POINTER_ARRAY(mCount, mAddresses);
}

void ExtractAllAddresses(const ParsedHeader &aHeader, nsTArray<nsString> &names,
                         nsTArray<nsString> &emails)
{
  uint32_t count = aHeader.mCount;
  msgIAddressObject **addresses = aHeader.mAddresses;

  // Prefill arrays before we start
  names.SetLength(count);
  emails.SetLength(count);

  for (uint32_t i = 0; i < count; i++)
  {
    addresses[i]->GetName(names[i]);
    addresses[i]->GetEmail(emails[i]);
  }

  if (count == 1 && names[0].IsEmpty() && emails[0].IsEmpty())
  {
    names.Clear();
    emails.Clear();
  }
}

void ExtractDisplayAddresses(const ParsedHeader &aHeader,
                             nsTArray<nsString> &displayAddrs)
{
  uint32_t count = aHeader.mCount;
  msgIAddressObject **addresses = aHeader.mAddresses;

  displayAddrs.SetLength(count);
  for (uint32_t i = 0; i < count; i++)
    addresses[i]->ToString(displayAddrs[i]);

  if (count == 1 && displayAddrs[0].IsEmpty())
    displayAddrs.Clear();
}

/////////////////////////////////////////////////
// All of these are based on the above methods //
/////////////////////////////////////////////////

void ExtractEmails(const ParsedHeader &aHeader, nsTArray<nsString> &emails)
{
  nsTArray<nsString> names;
  ExtractAllAddresses(aHeader, names, emails);
}

void ExtractEmail(const ParsedHeader &aHeader, nsACString &email)
{
  nsAutoTArray<nsString, 1> names;
  nsAutoTArray<nsString, 1> emails;
  ExtractAllAddresses(aHeader, names, emails);

  if (emails.Length() > 0)
    CopyUTF16toUTF8(emails[0], email);
  else
    email.Truncate();
}

void ExtractFirstAddress(const ParsedHeader &aHeader, nsACString &name,
                         nsACString &email)
{
  nsAutoTArray<nsString, 1> names, emails;
  ExtractAllAddresses(aHeader, names, emails);
  if (names.Length() > 0)
  {
    CopyUTF16toUTF8(names[0], name);
    CopyUTF16toUTF8(emails[0], email);
  }
  else
  {
    name.Truncate();
    email.Truncate();
  }
}

void ExtractFirstAddress(const ParsedHeader &aHeader, nsAString &name,
                         nsACString &email)
{
  nsAutoTArray<nsString, 1> names, emails;
  ExtractAllAddresses(aHeader, names, emails);
  if (names.Length() > 0)
  {
    name = names[0];
    CopyUTF16toUTF8(emails[0], email);
  }
  else
  {
    name.Truncate();
    email.Truncate();
  }
}

void ExtractName(const ParsedHeader &aHeader, nsACString &name)
{
  nsCString email;
  ExtractFirstAddress(aHeader, name, email);
  if (name.IsEmpty())
    name = email;
}

void ExtractName(const ParsedHeader &aHeader, nsAString &name)
{
  nsAutoTArray<nsString, 1> names;
  nsAutoTArray<nsString, 1> emails;
  ExtractAllAddresses(aHeader, names, emails);
  if (names.Length() > 0)
  {
    if (names[0].IsEmpty())
      name = emails[0];
    else
      name = names[0];
  }
  else
  {
    name.Truncate();
  }
}

} // namespace mailnews
} // namespace mozilla

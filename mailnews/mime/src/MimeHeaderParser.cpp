/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/mailnews/Services.h"
#include "mozilla/DebugOnly.h"
#include "nsMemory.h"
#include "nsAutoPtr.h"
#include "nsCOMPtr.h"
#include "nsIMimeConverter.h"
#include "nsIMsgHeaderParser.h"

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

  nsCOMPtr<msgIAddressObject> address;
  headerParser->MakeMailboxObject(aName, aEmail, getter_AddRefs(address));
  msgIAddressObject *obj = address;
  headerParser->MakeMimeHeader(&obj, 1, full);
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

nsCOMArray<msgIAddressObject> DecodedHeader(const nsAString &aHeader)
{
  nsCOMArray<msgIAddressObject> retval;
  if (aHeader.IsEmpty()) {
    return retval;
  }
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());
  msgIAddressObject **addresses = nullptr;
  uint32_t length;
  nsresult rv = headerParser->ParseDecodedHeader(aHeader, false,
    &length, &addresses);
  MOZ_ASSERT(NS_SUCCEEDED(rv), "Javascript jsmime returned an error!");
  if (NS_SUCCEEDED(rv) && length > 0 && addresses) {
    retval.Adopt(addresses, length);
  }
  return retval;
}

nsCOMArray<msgIAddressObject> EncodedHeader(const nsACString &aHeader,
                                            const char *aCharset)
{
  nsCOMArray<msgIAddressObject> retval;
  if (aHeader.IsEmpty()) {
    return retval;
  }
  nsCOMPtr<nsIMsgHeaderParser> headerParser(services::GetHeaderParser());
  msgIAddressObject **addresses = nullptr;
  uint32_t length;
  nsresult rv = headerParser->ParseEncodedHeader(aHeader, aCharset,
    false, &length, &addresses);
  MOZ_ASSERT(NS_SUCCEEDED(rv), "This should never fail!");
  if (NS_SUCCEEDED(rv) && length > 0 && addresses) {
    retval.Adopt(addresses, length);
  }
  return retval;
}

void ExtractAllAddresses(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsTArray<nsString> &names, nsTArray<nsString> &emails)
{
  uint32_t count = aHeader.Length();

  // Prefill arrays before we start
  names.SetLength(count);
  emails.SetLength(count);

  for (uint32_t i = 0; i < count; i++)
  {
    aHeader[i]->GetName(names[i]);
    aHeader[i]->GetEmail(emails[i]);
  }

  if (count == 1 && names[0].IsEmpty() && emails[0].IsEmpty())
  {
    names.Clear();
    emails.Clear();
  }
}

void ExtractDisplayAddresses(const nsCOMArray<msgIAddressObject> &aHeader,
                             nsTArray<nsString> &displayAddrs)
{
  uint32_t count = aHeader.Length();

  displayAddrs.SetLength(count);
  for (uint32_t i = 0; i < count; i++)
    aHeader[i]->ToString(displayAddrs[i]);

  if (count == 1 && displayAddrs[0].IsEmpty())
    displayAddrs.Clear();
}

/////////////////////////////////////////////////
// All of these are based on the above methods //
/////////////////////////////////////////////////

void ExtractEmails(const nsCOMArray<msgIAddressObject> &aHeader,
                   nsTArray<nsString> &emails)
{
  nsTArray<nsString> names;
  ExtractAllAddresses(aHeader, names, emails);
}

void ExtractEmail(const nsCOMArray<msgIAddressObject> &aHeader,
                  nsACString &email)
{
  nsAutoTArray<nsString, 1> names;
  nsAutoTArray<nsString, 1> emails;
  ExtractAllAddresses(aHeader, names, emails);

  if (emails.Length() > 0)
    CopyUTF16toUTF8(emails[0], email);
  else
    email.Truncate();
}

void ExtractFirstAddress(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsACString &name, nsACString &email)
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

void ExtractFirstAddress(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsAString &name, nsACString &email)
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

void ExtractName(const nsCOMArray<msgIAddressObject> &aHeader, nsACString &name)
{
  nsCString email;
  ExtractFirstAddress(aHeader, name, email);
  if (name.IsEmpty())
    name = email;
}

void ExtractName(const nsCOMArray<msgIAddressObject> &aHeader, nsAString &name)
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

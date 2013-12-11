/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MimeHeaderParser.h"
#include "nsCOMPtr.h"
#include "nsIMsgHeaderParser.h"
#include "nsServiceManagerUtils.h"

namespace mozilla {
namespace mailnews {

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
  nsCOMPtr<nsIMsgHeaderParser> headerParser =
    do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID);

  headerParser->MakeMimeAddress(aName, aEmail, full);
}

void MakeDisplayAddress(const nsAString &aName, const nsAString &aEmail,
                        nsAString &full)
{
  nsCOMPtr<nsIMsgHeaderParser> headerParser =
    do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID);

  nsCOMPtr<msgIAddressObject> object;
  headerParser->MakeMailboxObject(aName, aEmail, getter_AddRefs(object));
  object->ToString(full);
}

} // namespace mailnews
} // namespace mozilla

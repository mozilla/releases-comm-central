/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MimeHeaderParser_h__
#define MimeHeaderParser_h__

#include "nsCOMArray.h"
#include "nsStringGlue.h"
#include "nsTArray.h"

class msgIAddressObject;

namespace mozilla {
namespace mailnews {

/**
 * This is used to signal that the input header value has already been decoded
 * according to RFC 2047 and is in UTF-16 form.
 */
nsCOMArray<msgIAddressObject> DecodedHeader(const nsAString &aHeader);

/**
 * This is used to signal that the input header value needs to be decoded
 * according to RFC 2047. The charset parameter indicates the charset to assume
 * that non-ASCII data is in; if the value is null (the default), then the
 * charset is assumed to be UTF-8.
 */
nsCOMArray<msgIAddressObject> EncodedHeader(const nsACString &aHeader,
                                            const char *aCharset = nullptr);

namespace detail {
void DoConversion(const nsTArray<nsString> &aUTF16, nsTArray<nsCString> &aUTF8);
};
/**
 * This is a class designed for use as temporaries so that methods can pass
 * an nsTArray<nsCString> into methods that expect nsTArray<nsString> for out
 * parameters (this does not work for in-parameters).
 *
 * It works by internally providing an nsTArray<nsString> which it uses for its
 * external API operations. If the user requests an array of nsCString elements
 * instead, it converts the UTF-16 array to a UTF-8 array on destruction.
 */
template <uint32_t N = 5>
class UTF16ArrayAdapter
{
public:
  UTF16ArrayAdapter(nsTArray<nsCString> &aUTF8Array)
  : mUTF8Array(aUTF8Array) {}
  ~UTF16ArrayAdapter() { detail::DoConversion(mUTF16Array, mUTF8Array); }
  operator nsTArray<nsString>&() { return mUTF16Array; }
private:
  nsTArray<nsCString> &mUTF8Array;
  nsAutoTArray<nsString, N> mUTF16Array;
};

/**
 * Given a name and an email, both encoded in UTF-8, produce a string suitable
 * for writing in an email header by quoting where necessary.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email. Note that this DOES NOT do any RFC 2047
 * encoding.
 */
void MakeMimeAddress(const nsACString &aName, const nsACString &aEmail,
                     nsACString &full);

/**
 * Given a name and an email, produce a string suitable for writing in an email
 * header by quoting where necessary.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email. Note that this DOES NOT do any RFC 2047
 * encoding.
 */
void MakeMimeAddress(const nsAString &aName, const nsAString &aEmail,
                     nsAString &full);

/**
 * Given a name and an email, both encoded in UTF-8, produce a string suitable
 * for displaying in UI.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email.
 */
void MakeDisplayAddress(const nsAString &aName, const nsAString &aEmail,
                        nsAString &full);

/**
 * Returns a copy of the input which may have had some addresses removed.
 * Addresses are removed if they are already in either of the supplied
 * address lists.
 *
 * Addresses are considered to be the same if they contain the same email
 * address parts, ignoring case. Display names or comments are not compared.
 *
 * @param aHeader      The addresses to remove duplicates from.
 * @param aOtherEmails Other addresses that the duplicate removal process also
 *                     checks for duplicates against. Addresses in this list
 *                     will not be added to the result.
 * @return             The original header with duplicate addresses removed.
 */
void RemoveDuplicateAddresses(const nsACString &aHeader,
                              const nsACString &aOtherEmails,
                              nsACString &result);

/**
 * Given a message header, extract all names and email addresses found in that
 * header into the two arrays.
 */
void ExtractAllAddresses(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsTArray<nsString> &names, nsTArray<nsString> &emails);

/**
 * Given a raw message header value, extract display names for every address
 * found in the header.
 */
void ExtractDisplayAddresses(const nsCOMArray<msgIAddressObject> &aHeader,
                             nsTArray<nsString> &addresses);

/**
 * Given a raw message header value, extract all the email addresses into an
 * array.
 *
 * Duplicate email addresses are not removed from the output list.
 */
void ExtractEmails(const nsCOMArray<msgIAddressObject> &aHeader,
                   nsTArray<nsString> &emails);

/**
 * Given a raw message header value, extract the first name/email address found
 * in the header. This is essentially equivalent to grabbing the first entry of
 * ExtractAllAddresses.
 */
void ExtractFirstAddress(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsACString &name, nsACString &email);

/**
 * Given an RFC 2047-decoded message header value, extract the first name/email
 * address found in the header. This is essentially equivalent to grabbing the
 * first entry of ExtractAllAddresses.
 */
void ExtractFirstAddress(const nsCOMArray<msgIAddressObject> &aHeader,
                         nsAString &name, nsACString &email);

/**
 * Given a raw message header value, extract the first email address found in
 * the header.
 */
void ExtractEmail(const nsCOMArray<msgIAddressObject> &aHeader,
                  nsACString &email);

/**
 * Given a raw message header value, extract and clean up the first display
 * name found in the header. If there is no display name, the email address is
 * used instead.
 */
void ExtractName(const nsCOMArray<msgIAddressObject> &aHeader,
                 nsACString &name);

/**
 * Given an RFC 2047-decoded message header value, extract the first display
 * name found in the header. If there is no display name, the email address is
 * returned instead.
 */
void ExtractName(const nsCOMArray<msgIAddressObject> &aDecodedHeader,
                 nsAString &name);

} // namespace mailnews
} // namespace mozilla

#endif

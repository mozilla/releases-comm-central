/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgI18N_H_
#define _nsMsgI18N_H_

#include "nscore.h"
#include "msgCore.h"
#include "nsString.h"
class nsIFile;

/**
 * Encode an input string into RFC 2047 form.
 *
 * @param header       [IN] A header to encode.
 * @param structured   [IN] Specify the header is structured or non-structured
 *                          field (See RFC-822).
 * @param charset      [IN] Charset name to convert.
 * @param fieldnamelen [IN] Header field name length. (e.g. "From: " -> 6)
 * @param usemime      [IN] If false then apply charset conversion only no MIME
 *                          encoding.
 * @return             Encoded buffer (in C string) or NULL in case of error.
 */
NS_MSG_BASE char* nsMsgI18NEncodeMimePartIIStr(const char* header,
                                               bool structured,
                                               const char* charset,
                                               int32_t fieldnamelen);

/**
 * Check if given charset is stateful (e.g. ISO-2022-JP).
 *
 * @param charset     [IN] Charset name.
 * @return            True if stateful
 */
NS_MSG_BASE bool nsMsgI18Nstateful_charset(const char* charset);

/**
 * Check if given charset is multibyte (e.g. Shift_JIS, Big5).
 *
 * @param charset     [IN] Charset name.
 * @return            True if multibyte
 */
NS_MSG_BASE bool nsMsgI18Nmultibyte_charset(const char* charset);

/**
 * Check the input (unicode) string is in a range of the given charset after the
 * conversion. Note, do not use this for large string (e.g. message body) since
 * this actually applies the conversion to the buffer.
 *
 * @param charset  [IN] Charset to be converted.
 * @param inString [IN] Input unicode string to be examined.
 * @return         True if the string can be converted within the charset range.
 *                 False if one or more characters cannot be converted to the
 *                 target charset.
 */
NS_MSG_BASE bool nsMsgI18Ncheck_data_in_charset_range(const char* charset,
                                                      const char16_t* inString);
/**
 * Convert from unicode to target charset.
 *
 * @param charset     [IN] Charset name.
 * @param inString    [IN] Unicode string to convert.
 * @param outString   [OUT] Converted output string.
 * @param aReportUencNoMapping [IN] Set encoder to report (instead of using
 *                                  replacement char on errors). Set to true
 *                                  to receive NS_ERROR_UENC_NOMAPPING when
 *                                  that happens. Note that
 *                                  NS_ERROR_UENC_NOMAPPING is a success code!
 * @return            nsresult.
 */
NS_MSG_BASE nsresult nsMsgI18NConvertFromUnicode(
    const nsACString& aCharset, const nsAString& inString,
    nsACString& outString, bool reportUencNoMapping = false);
/**
 * Convert from charset to unicode.
 *
 * @param charset     [IN] Charset name.
 * @param inString    [IN] Input string to convert.
 * @param outString   [OUT] Output unicode string.
 * @return            nsresult.
 */
NS_MSG_BASE nsresult nsMsgI18NConvertToUnicode(const nsACString& aCharset,
                                               const nsACString& inString,
                                               nsAString& outString);
/**
 * Parse for META charset.
 *
 * @param file    [IN] A nsIFile.
 * @return            A charset name or empty string if not found.
 */
NS_MSG_BASE const char* nsMsgI18NParseMetaCharset(nsIFile* file);

/**
 * Shrink the aStr to aMaxLength bytes. Note that this doesn't check whether
 * the aUTF8Str is valid UTF-8 string.
 *
 * @param inString   [IN] Input UTF-8 string (it must be valid UTF-8 string)
 * @param aMaxLength [IN] Shrink to this length (it means bytes)
 * @param outString  [OUT] Shrunken UTF-8 string
 * @return           nsresult
 */
NS_MSG_BASE nsresult nsMsgI18NShrinkUTF8Str(const nsACString& inString,
                                            uint32_t aMaxLength,
                                            nsACString& outString);

/*
 * Convert raw bytes in header to UTF-16
 *
 * @param inString   [IN] Input raw octets
 * @param outString  [OUT] Output UTF-16 string
 */
NS_MSG_BASE void nsMsgI18NConvertRawBytesToUTF16(const nsACString& inString,
                                                 const nsACString& charset,
                                                 nsAString& outString);

/*
 * Convert raw bytes in header to UTF-8
 *
 * @param inString   [IN] Input raw octets
 * @param outString  [OUT] Output UTF-8 string
 */
NS_MSG_BASE void nsMsgI18NConvertRawBytesToUTF8(const nsACString& inString,
                                                const nsACString& charset,
                                                nsACString& outString);

// Decode UTF-7 to UTF-16. No encoding supported.
NS_MSG_BASE nsresult CopyUTF7toUTF16(const nsACString& aSrc, nsAString& aDest);

// Convert between UTF-16 and modified UTF-7 used for IMAP.
NS_MSG_BASE nsresult CopyFolderNameToUTF16(const nsACString& aSrc,
                                           nsAString& aDest);
NS_MSG_BASE nsresult CopyUTF16toMUTF7(const nsAString& aSrc, nsACString& aDest);
NS_MSG_BASE nsresult CopyMUTF7toUTF16(const nsACString& aSrc, nsAString& aDest);

#endif /* _nsMsgI18N_H_ */

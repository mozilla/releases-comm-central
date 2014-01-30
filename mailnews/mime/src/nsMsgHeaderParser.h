/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/********************************************************************************************************

   Interface for parsing RFC-822 addresses.

*********************************************************************************************************/

#ifndef nsMSGRFCPARSER_h__
#define nsMSGRFCPARSER_h__

#include "msgCore.h"
#include "nsIMsgHeaderParser.h" /* include the interface we are going to support */
#include "nsIMimeConverter.h"
#include "comi18n.h"
#include "nsCOMArray.h"
#include "nsCOMPtr.h"
#include "nsStringGlue.h"

 /*
  * RFC-822 parser
  */

class nsMsgHeaderParser: public nsIMsgHeaderParser
{
public:
  nsMsgHeaderParser();
  virtual ~nsMsgHeaderParser();

  /* this macro defines QueryInterface, AddRef and Release for this class */
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGHEADERPARSER

  /**
   * Given a string which contains a list of Header addresses, parses it into
   * their component names and mailboxes.
   *
   * @param aLine          The header line to parse.
   * @param aNames         A string of the names in the header line. The names
   *                       are separated by null-terminators.
   *                       This param may be null if the caller does not want
   *                       this part of the result.
   * @param aAddresses     A string of the addresses in the header line. The
   *                       addresses are separated by null-terminators.
   *                       This param may be null if the caller does not want
   *                       this part of the result.
   * @param aNumAddresses  The number of addresses in the header. If this is
   *                       negative, there has been an error parsing the
   *                       header.
   */
  static nsresult ParseHeaderAddresses(const char *aLine, char **aNames,
                                       char **aAddresses, uint32_t *aNumAddresses);

  static nsresult UnquotePhraseOrAddr(const char *line, bool preserveIntegrity,
                                      char **result);
  static nsresult UnquotePhraseOrAddrWString(const char16_t *line,
                                             bool preserveIntegrity,
                                      char16_t **result);
};

class MsgAddressObject MOZ_FINAL : public msgIAddressObject
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_MSGIADDRESSOBJECT

  MsgAddressObject(const nsAString &aName, const nsAString &aEmail);

private:
  nsString mName;
  nsString mEmail;
};

#endif /* nsMSGRFCPARSER_h__ */

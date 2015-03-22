/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgSearchNews_h__
#include "nsMsgSearchAdapter.h"
#include "MailNewsTypes.h"
#include "nsTArray.h"

//-----------------------------------------------------------------------------
//---------- Adapter class for searching online (news) folders ----------------
//-----------------------------------------------------------------------------

class nsMsgSearchNews : public nsMsgSearchAdapter
{
public:
  nsMsgSearchNews (nsMsgSearchScopeTerm *scope, nsISupportsArray *termList);
  virtual ~nsMsgSearchNews ();

  NS_IMETHOD ValidateTerms () override;
  NS_IMETHOD Search (bool *aDone) override;
  NS_IMETHOD GetEncoding (char **result) override;
  NS_IMETHOD AddHit(nsMsgKey key) override;
  NS_IMETHOD CurrentUrlDone(nsresult exitCode) override;

  virtual nsresult Encode (nsCString *outEncoding);
  virtual char *EncodeTerm (nsIMsgSearchTerm *);
  char16_t *EncodeToWildmat (const char16_t *);

  void ReportHits ();
    void CollateHits ();
    void ReportHit (nsIMsgDBHdr *pHeaders, nsIMsgFolder *folder);

protected:
  nsCString m_encoding;
  bool m_ORSearch; // set to true if any of the search terms contains an OR for a boolean operator.

  nsTArray<nsMsgKey> m_candidateHits;
  nsTArray<nsMsgKey> m_hits;

  static const char *m_kNntpFrom;
  static const char *m_kNntpSubject;
  static const char *m_kTermSeparator;
  static const char *m_kUrlPrefix;
};

#endif


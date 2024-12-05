/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgLocalSearch_H
#define _nsMsgLocalSearch_H

#include "nsIMsgEnumerator.h"
#include "nsIUrlListener.h"

// inherit base implementation
#include "nsMsgSearchAdapter.h"

class nsIMsgDBHdr;
class nsIMsgSearchScopeTerm;
class nsIMsgFolder;
class nsMsgSearchBoolExpression;

class nsMsgSearchOfflineMail : public nsMsgSearchAdapter,
                               public nsIUrlListener {
 public:
  nsMsgSearchOfflineMail(nsIMsgSearchScopeTerm*,
                         nsTArray<RefPtr<nsIMsgSearchTerm>> const&);

  NS_DECL_ISUPPORTS_INHERITED

  NS_DECL_NSIURLLISTENER

  NS_IMETHOD ValidateTerms() override;
  NS_IMETHOD Search(bool* aDone) override;
  NS_IMETHOD AddResultElement(nsIMsgDBHdr*) override;

  static nsresult MatchTermsForFilter(
      nsIMsgDBHdr* msgToMatch,
      nsTArray<RefPtr<nsIMsgSearchTerm>> const& termList,
      const char* defaultCharset, nsIMsgSearchScopeTerm* scope,
      nsIMsgDatabase* db, const nsACString& headers,
      nsMsgSearchBoolExpression** aExpressionTree, bool* pResult);

  static nsresult MatchTermsForSearch(
      nsIMsgDBHdr* msgTomatch,
      nsTArray<RefPtr<nsIMsgSearchTerm>> const& termList,
      const char* defaultCharset, nsIMsgSearchScopeTerm* scope,
      nsIMsgDatabase* db, nsMsgSearchBoolExpression** aExpressionTree,
      bool* pResult);

  virtual nsresult OpenSummaryFile();

  static nsresult ProcessSearchTerm(nsIMsgDBHdr* msgToMatch,
                                    nsIMsgSearchTerm* aTerm,
                                    const char* defaultCharset,
                                    nsIMsgSearchScopeTerm* scope,
                                    nsIMsgDatabase* db,
                                    const nsACString& headers, bool Filtering,
                                    bool* pResult);

 protected:
  virtual ~nsMsgSearchOfflineMail();
  static nsresult MatchTerms(nsIMsgDBHdr* msgToMatch,
                             nsTArray<RefPtr<nsIMsgSearchTerm>> const& termList,
                             const char* defaultCharset,
                             nsIMsgSearchScopeTerm* scope, nsIMsgDatabase* db,
                             const nsACString& headers, bool ForFilters,
                             nsMsgSearchBoolExpression** aExpressionTree,
                             bool* pResult);

  static nsresult ConstructExpressionTree(
      nsTArray<RefPtr<nsIMsgSearchTerm>> const& termList, uint32_t termCount,
      uint32_t& aStartPosInList, nsMsgSearchBoolExpression** aExpressionTree);

  nsCOMPtr<nsIMsgDatabase> m_db;
  nsCOMPtr<nsIMsgEnumerator> m_listContext;
  void CleanUpScope();
};

class nsMsgSearchOfflineNews : public nsMsgSearchOfflineMail {
 public:
  nsMsgSearchOfflineNews(nsIMsgSearchScopeTerm*,
                         nsTArray<RefPtr<nsIMsgSearchTerm>> const&);
  virtual ~nsMsgSearchOfflineNews();
  NS_IMETHOD ValidateTerms() override;

  virtual nsresult OpenSummaryFile() override;
};

#endif

/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBeckyFilters_h___
#define nsBeckyFilters_h___

#include "nsIImportFilters.h"
#include "nsIFile.h"
#include "nsIMsgIncomingServer.h"
#include "nsMsgFilterCore.h"

class nsIMsgFilter;
class nsIMsgRuleAction;
class nsCString;

class nsBeckyFilters final : public nsIImportFilters
{
public:
  nsBeckyFilters();
  static nsresult Create(nsIImportFilters **aImport);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTFILTERS

private:
  virtual ~nsBeckyFilters();

  nsCOMPtr<nsIFile> mLocation;
  nsCOMPtr<nsIMsgIncomingServer> mServer;
  nsCOMPtr<nsIFile> mConvertedFile;

  nsresult GetDefaultFilterLocation(nsIFile **aFile);
  nsresult GetFilterFile(bool aIncoming, nsIFile *aLocation, nsIFile **aFile);
  nsresult ParseFilterFile(nsIFile *aFile, bool aIncoming);
  nsresult ParseRuleLine(const nsCString &aLine,
                         nsMsgSearchAttribValue *aSearchAttribute,
                         nsMsgSearchOpValue *aSearchOperator,
                         nsString &aSearchKeyword);
  nsresult CollectServers();
  nsresult FindMessageFolder(const nsAString& aName,
                             nsIMsgFolder *aParantFolder,
                             nsIMsgFolder **_retval);
  nsresult FindMessageFolderInServer(const nsAString& aName,
                                     nsIMsgIncomingServer *aServer,
                                     nsIMsgFolder **_retval);
  nsresult GetMessageFolder(const nsAString& aName, nsIMsgFolder **_retval);
  nsresult GetActionTarget(const nsCString &aLine, nsCString &aTarget);
  nsresult GetFolderNameFromTarget(const nsCString &aTarget, nsAString &aName);
  nsresult GetDistributeTarget(const nsCString &aLine,
                               nsCString &aTargetFolder);
  nsresult GetResendTarget(const nsCString &aLine,
                           nsCString &aTemplate,
                           nsCString &aTargetAddress);
  nsresult CreateRuleAction(nsIMsgFilter *aFilter,
                            nsMsgRuleActionType actionType,
                            nsIMsgRuleAction **_retval);
  nsresult CreateDistributeAction(const nsCString &aLine,
                                  nsIMsgFilter *aFilter,
                                  const nsMsgRuleActionType &aActionType,
                                  nsIMsgRuleAction **_retval);
  nsresult CreateLeaveOrDeleteAction(const nsCString &aLine,
                                     nsIMsgFilter *aFilter,
                                     nsIMsgRuleAction **_retval);
  nsresult CreateResendAction(const nsCString &aLine,
                              nsIMsgFilter *aFilter,
                              const nsMsgRuleActionType &aActionType,
                              nsIMsgRuleAction **_retval);
  nsresult CreateFilter(bool aIncoming, nsIMsgFilter **_retval);
  nsresult AppendFilter(nsIMsgFilter *aFilter);
  nsresult SetRuleAction(const nsCString &aLine, nsIMsgFilter *aFilter);
  nsresult SetSearchTerm(const nsCString &aLine, nsIMsgFilter *aFilter);
  nsresult RemoveConvertedFile();
};

#endif /* nsBeckyFilters_h___ */

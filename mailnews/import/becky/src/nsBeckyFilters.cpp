/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsArrayUtils.h"
#include "nsILineInputStream.h"
#include "nsIStringBundle.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsIMsgFilter.h"
#include "nsIMsgFilterList.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgAccount.h"
#include "nsIMsgSearchTerm.h"
#include "nsIMsgFolder.h"
#include "nsCOMPtr.h"
#include "nsMsgSearchCore.h"
#include "nsMsgBaseCID.h"
#include "nsMsgUtils.h"
#include "msgCore.h"

#include "nsBeckyFilters.h"
#include "nsBeckyStringBundle.h"
#include "nsBeckyUtils.h"

NS_IMPL_ISUPPORTS(nsBeckyFilters, nsIImportFilters)

nsresult
nsBeckyFilters::Create(nsIImportFilters **aImport)
{
  NS_ENSURE_ARG_POINTER(aImport);

  *aImport = new nsBeckyFilters();

  NS_ADDREF(*aImport);
  return NS_OK;
}

nsBeckyFilters::nsBeckyFilters()
: mLocation(nullptr),
  mServer(nullptr),
  mConvertedFile(nullptr)
{
}

nsBeckyFilters::~nsBeckyFilters()
{
}

nsresult
nsBeckyFilters::GetDefaultFilterLocation(nsIFile **aFile)
{
  NS_ENSURE_ARG_POINTER(aFile);

  nsresult rv;
  nsCOMPtr<nsIFile> filterDir;
  rv = nsBeckyUtils::GetDefaultMailboxDirectory(getter_AddRefs(filterDir));
  NS_ENSURE_SUCCESS(rv, rv);

  filterDir.forget(aFile);
  return NS_OK;
}

nsresult
nsBeckyFilters::GetFilterFile(bool aIncoming, nsIFile *aLocation, nsIFile **aFile)
{
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(aFile);

  // We assume the caller has already checked that aLocation is a directory,
  // otherwise it would not make sense to call us.

  nsresult rv;
  nsCOMPtr<nsIFile> filter;
  aLocation->Clone(getter_AddRefs(filter));
  if (aIncoming)
    rv = filter->Append(NS_LITERAL_STRING("IFilter.def"));
  else
    rv = filter->Append(NS_LITERAL_STRING("OFilter.def"));
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists = false;
  rv = filter->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists)
    return NS_ERROR_FILE_NOT_FOUND;

  filter.forget(aFile);
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyFilters::AutoLocate(char16_t **aDescription,
                           nsIFile **aLocation,
                           bool *_retval)
{
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(_retval);

  if (aDescription) {
    *aDescription =
      nsBeckyStringBundle::GetStringByName(u"BeckyImportDescription");
  }
  *aLocation = nullptr;
  *_retval = false;

  nsresult rv;
  nsCOMPtr<nsIFile> location;
  rv = GetDefaultFilterLocation(getter_AddRefs(location));
  if (NS_FAILED(rv))
    location = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  else
    *_retval = true;

  location.forget(aLocation);
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyFilters::SetLocation(nsIFile *aLocation)
{
  NS_ENSURE_ARG_POINTER(aLocation);

  bool exists = false;
  nsresult rv = aLocation->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists)
    return NS_ERROR_FILE_NOT_FOUND;

  mLocation = aLocation;
  return NS_OK;
}

static nsMsgSearchAttribValue
ConvertSearchKeyToAttrib(const nsACString &aKey)
{
  if (aKey.EqualsLiteral("From") ||
      aKey.EqualsLiteral("Sender") ||
      aKey.EqualsLiteral("From, Sender, X-Sender")) {
    return nsMsgSearchAttrib::Sender;
  } else if (aKey.EqualsLiteral("Subject")) {
    return nsMsgSearchAttrib::Subject;
  } else if (aKey.EqualsLiteral("[body]")) {
    return nsMsgSearchAttrib::Body;
  } else if (aKey.EqualsLiteral("Date")) {
    return nsMsgSearchAttrib::Date;
  } else if (aKey.EqualsLiteral("To")) {
    return nsMsgSearchAttrib::To;
  } else if (aKey.EqualsLiteral("Cc")) {
    return nsMsgSearchAttrib::CC;
  } else if (aKey.EqualsLiteral("To,  Cc,  Bcc:")) {
    return nsMsgSearchAttrib::ToOrCC;
  }
  return -1;
}

static nsMsgSearchOpValue
ConvertSearchFlagsToOperator(const nsACString &aFlags)
{
  nsCString flags(aFlags);
  int32_t lastTabPosition = flags.RFindChar('\t');
  if ((lastTabPosition == -1) ||
      ((int32_t)aFlags.Length() == lastTabPosition - 1)) {
    return -1;
  }

  switch (aFlags.CharAt(0)) {
    case 'X':
      return nsMsgSearchOp::DoesntContain;
    case 'O':
      if (aFlags.FindChar('T', lastTabPosition + 1) >= 0)
        return nsMsgSearchOp::BeginsWith;
      return nsMsgSearchOp::Contains;
    default:
      return -1;
  }
}

nsresult
nsBeckyFilters::ParseRuleLine(const nsCString &aLine,
                              nsMsgSearchAttribValue *aSearchAttribute,
                              nsMsgSearchOpValue *aSearchOperator,
                              nsString &aSearchKeyword)
{
  int32_t firstColonPosition = aLine.FindChar(':');
  if (firstColonPosition == -1 ||
      (int32_t)aLine.Length() == firstColonPosition - 1) {
    return NS_ERROR_FAILURE;
  }

  int32_t secondColonPosition = aLine.FindChar(':', firstColonPosition + 1);
  if (secondColonPosition == -1 ||
      (int32_t)aLine.Length() == secondColonPosition - 1) {
    return NS_ERROR_FAILURE;
  }

  int32_t length = secondColonPosition - firstColonPosition - 1;
  nsMsgSearchAttribValue searchAttribute;
  searchAttribute = ConvertSearchKeyToAttrib(Substring(aLine, firstColonPosition + 1, length));
  if (searchAttribute < 0)
    return NS_ERROR_FAILURE;

  int32_t tabPosition = aLine.FindChar('\t');
  if (tabPosition == -1 ||
      (int32_t)aLine.Length() == tabPosition - 1) {
    return NS_ERROR_FAILURE;
  }

  nsMsgSearchOpValue searchOperator;
  searchOperator = ConvertSearchFlagsToOperator(Substring(aLine, tabPosition + 1));
  if (searchOperator < 0)
    return NS_ERROR_FAILURE;

  *aSearchOperator = searchOperator;
  *aSearchAttribute = searchAttribute;
  length = tabPosition - secondColonPosition - 1;
  CopyUTF8toUTF16(Substring(aLine, secondColonPosition + 1, length), aSearchKeyword);
  return NS_OK;
}

nsresult
nsBeckyFilters::SetSearchTerm(const nsCString &aLine, nsIMsgFilter *aFilter)
{
  NS_ENSURE_ARG_POINTER(aFilter);

  nsresult rv;
  nsMsgSearchAttribValue searchAttribute = -1;
  nsMsgSearchOpValue searchOperator = -1;
  nsAutoString searchKeyword;
  rv = ParseRuleLine(aLine, &searchAttribute, &searchOperator, searchKeyword);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgSearchTerm> term;
  rv = aFilter->CreateTerm(getter_AddRefs(term));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = term->SetAttrib(searchAttribute);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = term->SetOp(searchOperator);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgSearchValue> value;
  rv = term->GetValue(getter_AddRefs(value));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = value->SetAttrib(searchAttribute);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = value->SetStr(searchKeyword);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = term->SetValue(value);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = term->SetBooleanAnd(false);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!searchKeyword.IsEmpty())
    rv = aFilter->SetFilterName(searchKeyword);
  else
    rv = aFilter->SetFilterName(NS_LITERAL_STRING("No name"));
  NS_ENSURE_SUCCESS(rv, rv);

  return aFilter->AppendTerm(term);
}

nsresult
nsBeckyFilters::CreateRuleAction(nsIMsgFilter *aFilter,
                                 nsMsgRuleActionType actionType,
                                 nsIMsgRuleAction **_retval)
{
  nsresult rv;
  nsCOMPtr<nsIMsgRuleAction> action;
  rv = aFilter->CreateAction(getter_AddRefs(action));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = action->SetType(actionType);
  NS_ENSURE_SUCCESS(rv, rv);

  action.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::GetActionTarget(const nsCString &aLine,
                                nsCString &aTarget)
{
  int32_t firstColonPosition = aLine.FindChar(':');
  if (firstColonPosition < -1 ||
      aLine.Length() == static_cast<uint32_t>(firstColonPosition)) {
    return NS_ERROR_FAILURE;
  }

  aTarget.Assign(Substring(aLine, firstColonPosition + 1));

  return NS_OK;
}

nsresult
nsBeckyFilters::GetResendTarget(const nsCString &aLine,
                                nsCString &aTemplate,
                                nsCString &aTargetAddress)
{
  nsresult rv;
  nsAutoCString target;
  rv = GetActionTarget(aLine, target);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t asteriskPosition = target.FindChar('*');
  if (asteriskPosition < 0) {
    aTemplate.Assign(target);
    return NS_OK;
  }

  if (target.Length() == static_cast<uint32_t>(asteriskPosition))
    return NS_ERROR_FAILURE;

  aTemplate.Assign(StringHead(target, asteriskPosition - 1));
  aTargetAddress.Assign(Substring(target, asteriskPosition + 1));

  return NS_OK;
}

nsresult
nsBeckyFilters::CreateResendAction(const nsCString &aLine,
                                   nsIMsgFilter *aFilter,
                                   const nsMsgRuleActionType &aActionType,
                                   nsIMsgRuleAction **_retval)
{
  nsresult rv;
  nsCOMPtr<nsIMsgRuleAction> action;
  rv = CreateRuleAction(aFilter, aActionType, getter_AddRefs(action));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString templateString;
  nsAutoCString targetAddress;
  rv = GetResendTarget(aLine, templateString, targetAddress);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aActionType == nsMsgFilterAction::Forward)
    rv = action->SetStrValue(targetAddress);
  else
    rv = action->SetStrValue(templateString);
  NS_ENSURE_SUCCESS(rv, rv);

  action.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::GetFolderNameFromTarget(const nsCString &aTarget, nsAString &aName)
{
  int32_t backslashPosition = aTarget.RFindChar('\\');
  if (backslashPosition > 0) {
    NS_ConvertUTF8toUTF16 utf16String(Substring(aTarget, backslashPosition + 1));
    nsBeckyUtils::TranslateFolderName(utf16String, aName);
  }

  return NS_OK;
}

nsresult
nsBeckyFilters::GetDistributeTarget(const nsCString &aLine,
                                    nsCString &aTargetFolder)
{
  nsresult rv;
  nsAutoCString target;
  rv = GetActionTarget(aLine, target);
  NS_ENSURE_SUCCESS(rv, rv);

  target.Trim("\\", false, true);
  nsAutoString folderName;
  rv = GetFolderNameFromTarget(target, folderName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr <nsIMsgFolder> folder;
  rv = GetMessageFolder(folderName, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!folder) {
    rv = mServer->GetRootMsgFolder(getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return folder->GetURI(aTargetFolder);
}

nsresult
nsBeckyFilters::CreateDistributeAction(const nsCString &aLine,
                                       nsIMsgFilter *aFilter,
                                       const nsMsgRuleActionType &aActionType,
                                       nsIMsgRuleAction **_retval)
{
  nsresult rv;
  nsCOMPtr<nsIMsgRuleAction> action;
  rv = CreateRuleAction(aFilter, aActionType, getter_AddRefs(action));
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoCString targetFolder;
  rv = GetDistributeTarget(aLine, targetFolder);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = action->SetTargetFolderUri(targetFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  action.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::CreateLeaveOrDeleteAction(const nsCString &aLine,
                                          nsIMsgFilter *aFilter,
                                          nsIMsgRuleAction **_retval)
{
  nsresult rv;
  nsMsgRuleActionType actionType;
  if (aLine.CharAt(3) == '0') {
    actionType = nsMsgFilterAction::LeaveOnPop3Server;
  } else if (aLine.CharAt(3) == '1') {
    if (aLine.CharAt(5) == '1')
      actionType = nsMsgFilterAction::Delete;
    else
      actionType = nsMsgFilterAction::DeleteFromPop3Server;
  } else {
    return NS_ERROR_FAILURE;
  }
  nsCOMPtr<nsIMsgRuleAction> action;
  rv = CreateRuleAction(aFilter, actionType, getter_AddRefs(action));
  NS_ENSURE_SUCCESS(rv, rv);

  action.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::SetRuleAction(const nsCString &aLine, nsIMsgFilter *aFilter)
{
  if (!aFilter || aLine.Length() < 4)
    return NS_ERROR_FAILURE;

  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgRuleAction> action;
  switch (aLine.CharAt(1)) {
    case 'R': // Reply
      rv = CreateResendAction(aLine,
                              aFilter,
                              nsMsgFilterAction::Reply,
                              getter_AddRefs(action));
      break;
    case 'F': // Forward
      rv = CreateResendAction(aLine,
                              aFilter,
                              nsMsgFilterAction::Forward,
                              getter_AddRefs(action));
      break;
    case 'L': // Leave or delete
      rv = CreateLeaveOrDeleteAction(aLine, aFilter, getter_AddRefs(action));
      break;
    case 'Y': // Copy
      rv = CreateDistributeAction(aLine,
                                  aFilter,
                                  nsMsgFilterAction::CopyToFolder,
                                  getter_AddRefs(action));
      break;
    case 'M': // Move
      rv = CreateDistributeAction(aLine,
                                  aFilter,
                                  nsMsgFilterAction::MoveToFolder,
                                  getter_AddRefs(action));
      break;
    case 'G': // Set flag
      if (aLine.CharAt(3) == 'R') // Read
        rv = CreateRuleAction(aFilter, nsMsgFilterAction::MarkRead, getter_AddRefs(action));
      break;
    default:
      return NS_OK;
  }
  NS_ENSURE_SUCCESS(rv, rv);

  if (action) {
    rv = aFilter->AppendAction(action);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

nsresult
nsBeckyFilters::CreateFilter(bool aIncoming, nsIMsgFilter **_retval)
{
  NS_ENSURE_STATE(mServer);

  nsCOMPtr <nsIMsgFilterList> filterList;
  nsresult rv = mServer->GetFilterList(nullptr, getter_AddRefs(filterList));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFilter> filter;
  rv = filterList->CreateFilter(EmptyString(), getter_AddRefs(filter));
  NS_ENSURE_SUCCESS(rv, rv);

  if (aIncoming)
    filter->SetFilterType(nsMsgFilterType::InboxRule | nsMsgFilterType::Manual);
  else
    filter->SetFilterType(nsMsgFilterType::PostOutgoing | nsMsgFilterType::Manual);

  filter->SetEnabled(true);
  filter.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::AppendFilter(nsIMsgFilter *aFilter)
{
  NS_ENSURE_STATE(mServer);

  nsCOMPtr <nsIMsgFilterList> filterList;
  nsresult rv = mServer->GetFilterList(nullptr, getter_AddRefs(filterList));
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t count;
  rv = filterList->GetFilterCount(&count);
  NS_ENSURE_SUCCESS(rv, rv);

  return filterList->InsertFilterAt(count, aFilter);
}

nsresult
nsBeckyFilters::ParseFilterFile(nsIFile *aFile, bool aIncoming)
{
  nsresult rv;
  nsCOMPtr<nsILineInputStream> lineStream;
  rv = nsBeckyUtils::CreateLineInputStream(aFile, getter_AddRefs(lineStream));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more = true;
  nsAutoCString line;

  nsCOMPtr<nsIMsgFilter> filter;
  while (NS_SUCCEEDED(rv) && more) {
    rv = lineStream->ReadLine(line, &more);

    switch (line.CharAt(0)) {
      case ':':
        if (line.EqualsLiteral(":Begin \"\"")) {
          CreateFilter(aIncoming, getter_AddRefs(filter));
        } else if (line.EqualsLiteral(":End \"\"")) {
          if (filter)
            AppendFilter(filter);
          filter = nullptr;
        }
        break;
      case '!':
        SetRuleAction(line, filter);
        break;
      case '@':
        SetSearchTerm(line, filter);
        break;
      case '$': // $X: disabled
        if (StringBeginsWith(line, NS_LITERAL_CSTRING("$X")) && filter) {
          filter->SetEnabled(false);
        }
        break;
      default:
        break;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsBeckyFilters::Import(char16_t **aError,
                       bool *_retval)
{
  NS_ENSURE_ARG_POINTER(aError);
  NS_ENSURE_ARG_POINTER(_retval);

  // If mLocation is null, set it to the default filter directory.
  // If mLocation is a file, we import it as incoming folder.
  // If mLocation is a directory, we try to import incoming and outgoing folders
  // from it (in default files).

  *_retval = false;
  nsresult rv;
  nsCOMPtr<nsIFile> filterFile;

  bool haveFile = false;

  if (!mLocation) {
    bool retval = false;
    rv = AutoLocate(nullptr, getter_AddRefs(mLocation), &retval);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!retval)
      return NS_ERROR_FILE_NOT_FOUND;
  }

  // What type of location do we have?
  bool isDirectory = false;
  rv = mLocation->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (isDirectory) {
    haveFile = false;
  } else {
    bool isFile = false;
    rv = mLocation->IsFile(&isFile);
    NS_ENSURE_SUCCESS(rv, rv);
    if (isFile) {
      haveFile = true;
      mLocation->Clone(getter_AddRefs(filterFile));
    } else {
      // mLocation is neither file nor directory.
      return NS_ERROR_UNEXPECTED;
    }
  }

  bool haveIncoming = true;
  if (haveFile) {
    // If the passed filename equals OFilter.def, import as outgoing filters.
    // Everything else is considered incoming.
    nsAutoString fileName;
    rv = mLocation->GetLeafName(fileName);
    NS_ENSURE_SUCCESS(rv, rv);
    if (fileName.EqualsLiteral("OFilter.def"))
      haveIncoming = false;
  }

  // Try importing from the passed in file or the default incoming filters file.
  if ((haveFile && haveIncoming) || (!haveFile &&
      NS_SUCCEEDED(GetFilterFile(true, mLocation, getter_AddRefs(filterFile)))))
  {
    rv = CollectServers();
    NS_ENSURE_SUCCESS(rv, rv);

    rv = nsBeckyUtils::ConvertToUTF8File(filterFile, getter_AddRefs(mConvertedFile));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = ParseFilterFile(mConvertedFile, true);
    if (NS_SUCCEEDED(rv))
      *_retval = true;

    (void)RemoveConvertedFile();
  }

  // If we didn't have a file passed (but a directory), try finding also outgoing filters.
  if ((haveFile && !haveIncoming) || (!haveFile &&
      NS_SUCCEEDED(GetFilterFile(false, mLocation, getter_AddRefs(filterFile)))))
  {
    rv = CollectServers();
    NS_ENSURE_SUCCESS(rv, rv);

    rv = nsBeckyUtils::ConvertToUTF8File(filterFile, getter_AddRefs(mConvertedFile));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = ParseFilterFile(mConvertedFile, false);
    if (NS_SUCCEEDED(rv))
      *_retval = true;

    (void)RemoveConvertedFile();
  }

  return rv;
}

nsresult
nsBeckyFilters::FindMessageFolder(const nsAString &aName,
                                  nsIMsgFolder *aParentFolder,
                                  nsIMsgFolder **_retval)
{
  nsresult rv;

  nsCOMPtr<nsIMsgFolder> found;
  rv = aParentFolder->GetChildNamed(aName, getter_AddRefs(found));
  if (found) {
    found.forget(_retval);
    return NS_OK;
  }

  nsCOMPtr<nsISimpleEnumerator> children;
  rv = aParentFolder->GetSubFolders(getter_AddRefs(children));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more;
  nsCOMPtr<nsISupports> entry;
  while (NS_SUCCEEDED(children->HasMoreElements(&more)) && more) {
    rv = children->GetNext(getter_AddRefs(entry));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgFolder> child = do_QueryInterface(entry, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = FindMessageFolder(aName, child, getter_AddRefs(found));
    if (found) {
      found.forget(_retval);
      return NS_OK;
    }
  }

  return NS_MSG_ERROR_INVALID_FOLDER_NAME;
}

nsresult
nsBeckyFilters::FindMessageFolderInServer(const nsAString &aName,
                                          nsIMsgIncomingServer *aServer,
                                          nsIMsgFolder **_retval)
{
  nsresult rv;
  nsCOMPtr <nsIMsgFolder> rootFolder;
  rv = aServer->GetRootMsgFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  return FindMessageFolder(aName, rootFolder, _retval);
}

nsresult
nsBeckyFilters::GetMessageFolder(const nsAString &aName,
                                 nsIMsgFolder **_retval)
{
  nsresult rv;

  nsCOMPtr<nsIMsgAccountManager> accountManager;
  accountManager = do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIArray> accounts;
  rv = accountManager->GetAccounts(getter_AddRefs(accounts));
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t accountCount;
  rv = accounts->GetLength(&accountCount);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> found;
  for (uint32_t i = 0; i < accountCount; i++) {
    nsCOMPtr<nsIMsgAccount> account(do_QueryElementAt(accounts, i));
    if (!account)
      continue;

    nsCOMPtr<nsIMsgIncomingServer> server;
    account->GetIncomingServer(getter_AddRefs(server));
    if (!server)
      continue;
    FindMessageFolderInServer(aName, server, getter_AddRefs(found));
    if (found)
      break;
  }

  if (!found) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = accountManager->GetLocalFoldersServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    FindMessageFolderInServer(aName, server, getter_AddRefs(found));
  }

  if (!found)
    return NS_MSG_ERROR_INVALID_FOLDER_NAME;

  found.forget(_retval);

  return NS_OK;
}

nsresult
nsBeckyFilters::CollectServers()
{
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager;
  accountManager = do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgAccount> defaultAccount;
  rv = accountManager->GetDefaultAccount(getter_AddRefs(defaultAccount));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  return defaultAccount->GetIncomingServer(getter_AddRefs(mServer));
}

nsresult
nsBeckyFilters::RemoveConvertedFile()
{
  nsresult rv = NS_OK;
  if (mConvertedFile) {
    bool exists = false;
    mConvertedFile->Exists(&exists);
    if (exists) {
      rv = mConvertedFile->Remove(false);
      if (NS_SUCCEEDED(rv))
        mConvertedFile = nullptr;
    }
  }
  return rv;
}


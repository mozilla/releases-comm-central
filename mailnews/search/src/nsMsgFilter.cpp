/* -*- Mode: C++; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this file implements the nsMsgFilter interface

#include "msgCore.h"
#include "nsIMsgHdr.h"
#include "nsMsgFilterList.h"  // for kFileVersion
#include "nsMsgFilter.h"
#include "nsMsgUtils.h"
#include "nsMsgLocalSearch.h"
#include "nsMsgSearchTerm.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgIncomingServer.h"
#include "nsMsgI18N.h"
#include "nsNativeCharsetUtils.h"
#include "nsIOutputStream.h"
#include "nsIStringBundle.h"
#include "nsServiceManagerUtils.h"
#include "nsIMsgFilterService.h"
#include "nsIMsgNewsFolder.h"
#include "prmem.h"
#include "mozilla/Components.h"
#include "mozilla/intl/AppDateTimeFormat.h"

static const char* kImapPrefix = "//imap:";
static const char* kWhitespace = "\b\t\r\n ";

nsMsgRuleAction::nsMsgRuleAction()
    : m_type(nsMsgFilterAction::None),
      m_priority(nsMsgPriority::notSet),
      m_junkScore(0) {}

nsMsgRuleAction::~nsMsgRuleAction() {}

NS_IMPL_ISUPPORTS(nsMsgRuleAction, nsIMsgRuleAction)

NS_IMPL_GETSET(nsMsgRuleAction, Type, nsMsgRuleActionType, m_type)

NS_IMETHODIMP nsMsgRuleAction::SetPriority(nsMsgPriorityValue aPriority) {
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::ChangePriority,
                 NS_ERROR_ILLEGAL_VALUE);
  m_priority = aPriority;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::GetPriority(nsMsgPriorityValue* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::ChangePriority,
                 NS_ERROR_ILLEGAL_VALUE);
  *aResult = m_priority;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::SetTargetFolderUri(const nsACString& aUri) {
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::MoveToFolder ||
                     m_type == nsMsgFilterAction::CopyToFolder,
                 NS_ERROR_ILLEGAL_VALUE);
  m_folderUri = aUri;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::GetTargetFolderUri(nsACString& aResult) {
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::MoveToFolder ||
                     m_type == nsMsgFilterAction::CopyToFolder,
                 NS_ERROR_ILLEGAL_VALUE);
  aResult = m_folderUri;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::SetJunkScore(int32_t aJunkScore) {
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::JunkScore && aJunkScore >= 0 &&
                     aJunkScore <= 100,
                 NS_ERROR_ILLEGAL_VALUE);
  m_junkScore = aJunkScore;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::GetJunkScore(int32_t* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_ENSURE_TRUE(m_type == nsMsgFilterAction::JunkScore,
                 NS_ERROR_ILLEGAL_VALUE);
  *aResult = m_junkScore;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::SetStrValue(const nsACString& aStrValue) {
  m_strValue = aStrValue;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgRuleAction::GetStrValue(nsACString& aStrValue) {
  aStrValue = m_strValue;
  return NS_OK;
}

/* attribute ACString customId; */
NS_IMETHODIMP nsMsgRuleAction::GetCustomId(nsACString& aCustomId) {
  aCustomId = m_customId;
  return NS_OK;
}

NS_IMETHODIMP nsMsgRuleAction::SetCustomId(const nsACString& aCustomId) {
  m_customId = aCustomId;
  return NS_OK;
}

// this can only be called after the customId is set
NS_IMETHODIMP nsMsgRuleAction::GetCustomAction(
    nsIMsgFilterCustomAction** aCustomAction) {
  NS_ENSURE_ARG_POINTER(aCustomAction);
  if (!m_customAction) {
    if (m_customId.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;
    nsresult rv;
    nsCOMPtr<nsIMsgFilterService> filterService =
        do_GetService("@mozilla.org/messenger/services/filters;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = filterService->GetCustomAction(m_customId,
                                        getter_AddRefs(m_customAction));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // found the correct custom action
  NS_ADDREF(*aCustomAction = m_customAction);
  return NS_OK;
}

nsMsgFilter::nsMsgFilter()
    : m_type(nsMsgFilterType::InboxRule | nsMsgFilterType::Manual),
      m_enabled(false),
      m_temporary(false),
      m_unparseable(false),
      m_filterList(nullptr),
      m_expressionTree(nullptr) {}

nsMsgFilter::~nsMsgFilter() { delete m_expressionTree; }

NS_IMPL_ISUPPORTS(nsMsgFilter, nsIMsgFilter)

NS_IMPL_GETSET(nsMsgFilter, FilterType, nsMsgFilterTypeType, m_type)
NS_IMPL_GETSET(nsMsgFilter, Enabled, bool, m_enabled)
NS_IMPL_GETSET(nsMsgFilter, Temporary, bool, m_temporary)
NS_IMPL_GETSET(nsMsgFilter, Unparseable, bool, m_unparseable)

NS_IMETHODIMP nsMsgFilter::GetFilterName(nsAString& name) {
  name = m_filterName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::SetFilterName(const nsAString& name) {
  m_filterName.Assign(name);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::GetFilterDesc(nsACString& description) {
  description = m_description;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::SetFilterDesc(const nsACString& description) {
  m_description.Assign(description);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::GetUnparsedBuffer(nsACString& unparsedBuffer) {
  unparsedBuffer = m_unparsedBuffer;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::SetUnparsedBuffer(const nsACString& unparsedBuffer) {
  m_unparsedBuffer.Assign(unparsedBuffer);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::AddTerm(
    nsMsgSearchAttribValue attrib,     /* attribute for this term          */
    nsMsgSearchOpValue op,             /* operator e.g. opContains           */
    nsIMsgSearchValue* value,          /* value e.g. "Dogbert"               */
    bool BooleanAND,                   /* true if AND is the boolean operator.
                                          false if OR is the boolean operators */
    const nsACString& arbitraryHeader) /* arbitrary header specified by user.
  ignored unless attrib = attribOtherHeader */
{
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::AppendTerm(nsIMsgSearchTerm* aTerm) {
  NS_ENSURE_TRUE(aTerm, NS_ERROR_NULL_POINTER);
  // invalidate expression tree if we're changing the terms
  delete m_expressionTree;
  m_expressionTree = nullptr;
  m_termList.AppendElement(aTerm);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::CreateTerm(nsIMsgSearchTerm** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_ADDREF(*aResult = new nsMsgSearchTerm);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::CreateAction(nsIMsgRuleAction** aAction) {
  NS_ENSURE_ARG_POINTER(aAction);
  NS_ADDREF(*aAction = new nsMsgRuleAction);
  return NS_OK;
}

// All the rules' actions form a unit, with no real order imposed.
// But certain actions like MoveToFolder or StopExecution would make us drop
// consecutive actions, while actions like AddTag implicitly care about the
// order of invocation. Hence we do as little reordering as possible, keeping
// the user-defined order as much as possible.
// We explicitly don't allow for filters which do "tag message as Important,
// copy it to another folder, tag it as To Do also, copy this different state
// elsewhere" in one go. You need to define separate filters for that.
//
// The order of actions returned by this method:
//   index    action(s)
//  -------   ---------
//     0      FetchBodyFromPop3Server
//    1..n    all other 'normal' actions, in their original order
//  n+1..m    CopyToFolder
//    m+1     MoveToFolder or Delete
//    m+2     StopExecution
NS_IMETHODIMP
nsMsgFilter::GetSortedActionList(
    nsTArray<RefPtr<nsIMsgRuleAction>>& aActionList) {
  aActionList.Clear();
  aActionList.SetCapacity(m_actionList.Length());

  // hold separate pointers into the action list
  uint32_t nextIndexForNormal = 0, nextIndexForCopy = 0, nextIndexForMove = 0;
  for (auto action : m_actionList) {
    if (!action) continue;

    nsMsgRuleActionType actionType;
    action->GetType(&actionType);
    switch (actionType) {
      case nsMsgFilterAction::FetchBodyFromPop3Server: {
        // always insert in front
        aActionList.InsertElementAt(0, action);
        ++nextIndexForNormal;
        ++nextIndexForCopy;
        ++nextIndexForMove;
        break;
      }

      case nsMsgFilterAction::CopyToFolder: {
        // insert into copy actions block, in order of appearance
        aActionList.InsertElementAt(nextIndexForCopy, action);
        ++nextIndexForCopy;
        ++nextIndexForMove;
        break;
      }

      case nsMsgFilterAction::MoveToFolder:
      case nsMsgFilterAction::Delete: {
        // insert into move/delete action block
        aActionList.InsertElementAt(nextIndexForMove, action);
        ++nextIndexForMove;
        break;
      }

      case nsMsgFilterAction::StopExecution: {
        // insert into stop action block
        aActionList.AppendElement(action);
        break;
      }

      default: {
        // insert into normal action block, in order of appearance
        aActionList.InsertElementAt(nextIndexForNormal, action);
        ++nextIndexForNormal;
        ++nextIndexForCopy;
        ++nextIndexForMove;
        break;
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::AppendAction(nsIMsgRuleAction* aAction) {
  NS_ENSURE_ARG_POINTER(aAction);

  m_actionList.AppendElement(aAction);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::GetActionAt(uint32_t aIndex, nsIMsgRuleAction** aAction) {
  NS_ENSURE_ARG_POINTER(aAction);
  NS_ENSURE_ARG(aIndex < m_actionList.Length());

  NS_ENSURE_TRUE(m_actionList[aIndex], NS_ERROR_ILLEGAL_VALUE);
  NS_IF_ADDREF(*aAction = m_actionList[aIndex]);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::GetActionIndex(nsIMsgRuleAction* aAction, int32_t* aIndex) {
  NS_ENSURE_ARG_POINTER(aIndex);

  *aIndex = m_actionList.IndexOf(aAction);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::GetActionCount(uint32_t* aCount) {
  NS_ENSURE_ARG_POINTER(aCount);

  *aCount = m_actionList.Length();
  return NS_OK;
}

NS_IMETHODIMP  // for editing a filter
nsMsgFilter::ClearActionList() {
  m_actionList.Clear();
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::GetTerm(
    int32_t termIndex,
    nsMsgSearchAttribValue* attrib, /* attribute for this term          */
    nsMsgSearchOpValue* op,         /* operator e.g. opContains           */
    nsIMsgSearchValue** value,      /* value e.g. "Dogbert"               */
    bool* booleanAnd, /* true if AND is the boolean operator. false if OR is the
                         boolean operator */
    nsACString& arbitraryHeader) /* arbitrary header specified by user.ignore
                                    unless attrib = attribOtherHeader */
{
  if (termIndex >= (int32_t)m_termList.Length()) {
    return NS_ERROR_INVALID_ARG;
  }
  nsIMsgSearchTerm* term = m_termList[termIndex];
  if (attrib) term->GetAttrib(attrib);
  if (op) term->GetOp(op);
  if (value) term->GetValue(value);
  if (booleanAnd) term->GetBooleanAnd(booleanAnd);
  if (attrib && *attrib > nsMsgSearchAttrib::OtherHeader &&
      *attrib < nsMsgSearchAttrib::kNumMsgSearchAttributes) {
    term->GetArbitraryHeader(arbitraryHeader);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::GetSearchTerms(
    nsTArray<RefPtr<nsIMsgSearchTerm>>& terms) {
  delete m_expressionTree;
  m_expressionTree = nullptr;
  terms = m_termList.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::SetSearchTerms(
    nsTArray<RefPtr<nsIMsgSearchTerm>> const& terms) {
  delete m_expressionTree;
  m_expressionTree = nullptr;
  m_termList = terms.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::SetScope(nsIMsgSearchScopeTerm* aResult) {
  m_scope = aResult;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilter::GetScope(nsIMsgSearchScopeTerm** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_IF_ADDREF(*aResult = m_scope);
  return NS_OK;
}

// This function handles the logging both for success of filtering
// (NS_SUCCEEDED(aRcode)), and for error reporting (NS_FAILED(aRcode)
// when the filter action (such as file move/copy) failed.
//
// @param aRcode  NS_OK for successful filtering
//                operation, otherwise, an error code for filtering failure.
// @param aErrmsg Not used for success case (ignored), and a non-null
//                error message for failure case.
//
// CAUTION: Unless logging is enabled, no error/warning is shown.
// So enable logging if you would like to see the error/warning.
//
// XXX The current code in this file does not report errors of minor
// operations such as adding labels and so forth which may fail when
// underlying file system for the message store experiences
// failure. For now, most visible major errors such as message
// move/copy failures are taken care of.
//
// XXX Possible Improvement: For error case reporting, someone might
// want to implement a transient message that appears and stick until
// the user clears in the message status bar, etc. For now, we log an
// error in a similar form as a conventional successful filter event
// with additional error information at the beginning.
//
nsresult nsMsgFilter::LogRuleHitGeneric(nsIMsgRuleAction* aFilterAction,
                                        nsIMsgDBHdr* aMsgHdr, nsresult aRcode,
                                        const nsACString& aErrmsg) {
  NS_ENSURE_ARG_POINTER(aFilterAction);
  NS_ENSURE_ARG_POINTER(aMsgHdr);

  NS_ENSURE_TRUE(m_filterList, NS_OK);

  PRTime date;
  nsMsgRuleActionType actionType;

  nsString authorValue;
  nsString subjectValue;
  nsString filterName;
  nsString dateValue;

  GetFilterName(filterName);
  aFilterAction->GetType(&actionType);
  (void)aMsgHdr->GetDate(&date);
  PRExplodedTime exploded;
  PR_ExplodeTime(date, PR_LocalTimeParameters, &exploded);

  mozilla::intl::DateTimeFormat::StyleBag style;
  style.date = mozilla::Some(mozilla::intl::DateTimeFormat::Style::Short);
  style.time = mozilla::Some(mozilla::intl::DateTimeFormat::Style::Long);
  mozilla::intl::AppDateTimeFormat::Format(style, &exploded, dateValue);

  (void)aMsgHdr->GetMime2DecodedAuthor(authorValue);
  (void)aMsgHdr->GetMime2DecodedSubject(subjectValue);

  nsString buffer;
  // this is big enough to hold a log entry.
  // do this so we avoid growing and copying as we append to the log.
  buffer.SetCapacity(512);

  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = bundleService->CreateBundle(
      "chrome://messenger/locale/filter.properties", getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  // If error, prefix with the error code and error message.
  // A desired wording (without NEWLINEs):
  // Filter Action Failed "Move failed" with error code=0x80004005
  // while attempting: Applied filter "test" to message from
  // Some Test <test@example.com> - send test 3 at 2/13/2015 11:32:53 AM
  // moved message id = 54DE5165.7000907@example.com to
  // mailbox://nobody@Local%20Folders/test
  if (NS_FAILED(aRcode)) {
    // Convert aErrmsg to UTF16 string, and
    // convert aRcode to UTF16 string in advance.
    char tcode[20];
    PR_snprintf(tcode, sizeof(tcode), "0x%08x", aRcode);
    NS_ConvertASCIItoUTF16 tcode16(tcode);

    nsString tErrmsg;
    if (actionType != nsMsgFilterAction::Custom) {
      // If this is one of our internal actions, the passed string
      // is an identifier to get from the bundle.
      rv =
          bundle->GetStringFromName(PromiseFlatCString(aErrmsg).get(), tErrmsg);
      if (NS_FAILED(rv)) tErrmsg.Assign(NS_ConvertUTF8toUTF16(aErrmsg));
    } else {
      // The addon creating the custom action should have passed a localized
      // string.
      tErrmsg.Assign(NS_ConvertUTF8toUTF16(aErrmsg));
    }
    AutoTArray<nsString, 2> logErrorFormatStrings = {tErrmsg, tcode16};

    nsString filterFailureWarningPrefix;
    rv = bundle->FormatStringFromName("filterFailureWarningPrefix",
                                      logErrorFormatStrings,
                                      filterFailureWarningPrefix);
    NS_ENSURE_SUCCESS(rv, rv);
    buffer += filterFailureWarningPrefix;
    buffer.AppendLiteral("\n");
  }

  AutoTArray<nsString, 4> filterLogDetectFormatStrings = {
      filterName, authorValue, subjectValue, dateValue};
  nsString filterLogDetectStr;
  rv = bundle->FormatStringFromName(
      "filterLogDetectStr", filterLogDetectFormatStrings, filterLogDetectStr);
  NS_ENSURE_SUCCESS(rv, rv);

  buffer += filterLogDetectStr;
  buffer.AppendLiteral("\n");

  if (actionType == nsMsgFilterAction::MoveToFolder ||
      actionType == nsMsgFilterAction::CopyToFolder) {
    nsCString actionFolderUri;
    aFilterAction->GetTargetFolderUri(actionFolderUri);

    nsCString msgId;
    aMsgHdr->GetMessageId(msgId);

    AutoTArray<nsString, 2> logMoveFormatStrings;
    CopyUTF8toUTF16(msgId, *logMoveFormatStrings.AppendElement());
    CopyUTF8toUTF16(actionFolderUri, *logMoveFormatStrings.AppendElement());
    nsString logMoveStr;
    rv = bundle->FormatStringFromName(
        (actionType == nsMsgFilterAction::MoveToFolder) ? "logMoveStr"
                                                        : "logCopyStr",
        logMoveFormatStrings, logMoveStr);
    NS_ENSURE_SUCCESS(rv, rv);

    buffer += logMoveStr;
  } else if (actionType == nsMsgFilterAction::Custom) {
    nsCOMPtr<nsIMsgFilterCustomAction> customAction;
    nsAutoString filterActionName;
    rv = aFilterAction->GetCustomAction(getter_AddRefs(customAction));
    if (NS_SUCCEEDED(rv) && customAction)
      customAction->GetName(filterActionName);
    if (filterActionName.IsEmpty())
      bundle->GetStringFromName("filterMissingCustomAction", filterActionName);
    buffer += filterActionName;
  } else {
    nsString actionValue;
    nsAutoCString filterActionID;
    filterActionID = "filterAction"_ns;
    filterActionID.AppendInt(actionType);
    rv = bundle->GetStringFromName(filterActionID.get(), actionValue);
    NS_ENSURE_SUCCESS(rv, rv);

    buffer += actionValue;
  }
  buffer.AppendLiteral("\n");

  return m_filterList->LogFilterMessage(buffer, nullptr);
}

NS_IMETHODIMP nsMsgFilter::LogRuleHit(nsIMsgRuleAction* aFilterAction,
                                      nsIMsgDBHdr* aMsgHdr) {
  return nsMsgFilter::LogRuleHitGeneric(aFilterAction, aMsgHdr, NS_OK,
                                        EmptyCString());
}

NS_IMETHODIMP nsMsgFilter::LogRuleHitFail(nsIMsgRuleAction* aFilterAction,
                                          nsIMsgDBHdr* aMsgHdr, nsresult aRcode,
                                          const nsACString& aErrMsg) {
  return nsMsgFilter::LogRuleHitGeneric(aFilterAction, aMsgHdr, aRcode,
                                        aErrMsg);
}

NS_IMETHODIMP
nsMsgFilter::MatchHdr(nsIMsgDBHdr* msgHdr, nsIMsgFolder* folder,
                      nsIMsgDatabase* db, const nsACString& headers,
                      bool* pResult) {
  NS_ENSURE_ARG_POINTER(folder);
  NS_ENSURE_ARG_POINTER(msgHdr);
  nsCString folderCharset = "UTF-8"_ns;
  nsCOMPtr<nsIMsgNewsFolder> newsfolder(do_QueryInterface(folder));
  if (newsfolder) newsfolder->GetCharset(folderCharset);
  return nsMsgSearchOfflineMail::MatchTermsForFilter(
      msgHdr, m_termList, folderCharset.get(), m_scope, db, headers,
      &m_expressionTree, pResult);
}

NS_IMETHODIMP
nsMsgFilter::SetFilterList(nsIMsgFilterList* filterList) {
  // doesn't hold a ref.
  m_filterList = filterList;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilter::GetFilterList(nsIMsgFilterList** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_IF_ADDREF(*aResult = m_filterList);
  return NS_OK;
}

void nsMsgFilter::SetFilterScript(nsCString* fileName) {
  m_scriptFileName = *fileName;
}

nsresult nsMsgFilter::ConvertMoveOrCopyToFolderValue(
    nsIMsgRuleAction* filterAction, nsCString& moveValue) {
  NS_ENSURE_ARG_POINTER(filterAction);
  int16_t filterVersion = kFileVersion;
  if (m_filterList) m_filterList->GetVersion(&filterVersion);
  if (filterVersion <= k60Beta1Version) {
    nsCOMPtr<nsIMsgFolder> rootFolder;
    nsCString folderUri;

    m_filterList->GetFolder(getter_AddRefs(rootFolder));
    // if relative path starts with kImap, this is a move to folder on the same
    // server
    if (moveValue.Find(kImapPrefix) == 0) {
      int32_t prefixLen = PL_strlen(kImapPrefix);
      nsAutoCString originalServerPath(Substring(moveValue, prefixLen));
      if (filterVersion == k45Version) {
        nsAutoString unicodeStr;
        NS_CopyNativeToUnicode(originalServerPath, unicodeStr);

        nsresult rv = CopyUTF16toMUTF7(unicodeStr, originalServerPath);
        NS_ENSURE_SUCCESS(rv, rv);
      }

      nsCOMPtr<nsIMsgFolder> destIFolder;
      if (rootFolder) {
        rootFolder->FindSubFolder(originalServerPath,
                                  getter_AddRefs(destIFolder));
        if (destIFolder) {
          destIFolder->GetURI(folderUri);
          filterAction->SetTargetFolderUri(folderUri);
          moveValue.Assign(folderUri);
        }
      }
    } else {
      // start off leaving the value the same.
      filterAction->SetTargetFolderUri(moveValue);
      nsresult rv = NS_OK;
      nsCOMPtr<nsIMsgFolder> localMailRoot;
      rootFolder->GetURI(folderUri);
      // if the root folder is not imap, than the local mail root is the server
      // root. otherwise, it's the migrated local folders.
      if (!StringBeginsWith(folderUri, "imap:"_ns))
        localMailRoot = rootFolder;
      else {
        nsCOMPtr<nsIMsgAccountManager> accountManager =
            do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
        NS_ENSURE_SUCCESS(rv, rv);
        nsCOMPtr<nsIMsgIncomingServer> server;
        rv = accountManager->GetLocalFoldersServer(getter_AddRefs(server));
        if (NS_SUCCEEDED(rv) && server)
          rv = server->GetRootFolder(getter_AddRefs(localMailRoot));
      }
      if (NS_SUCCEEDED(rv) && localMailRoot) {
        nsCString localRootURI;
        nsCOMPtr<nsIMsgFolder> destIMsgFolder;
        localMailRoot->GetURI(localRootURI);
        nsCString destFolderUri;
        destFolderUri.Assign(localRootURI);
        // need to remove ".sbd" from moveValue, and perhaps escape it.
        int32_t offset = moveValue.Find(FOLDER_SUFFIX8 "/");
        if (offset != -1) moveValue.Cut(offset, FOLDER_SUFFIX_LENGTH);

#ifdef XP_MACOSX
        nsCString unescapedMoveValue;
        MsgUnescapeString(moveValue, 0, unescapedMoveValue);
        moveValue = unescapedMoveValue;
#endif
        destFolderUri.Append('/');
        if (filterVersion == k45Version) {
          nsAutoString unicodeStr;
          NS_CopyNativeToUnicode(moveValue, unicodeStr);
          rv = NS_MsgEscapeEncodeURLPath(unicodeStr, moveValue);
        }
        destFolderUri.Append(moveValue);
        localMailRoot->GetChildWithURI(destFolderUri, true,
                                       false /*caseInsensitive*/,
                                       getter_AddRefs(destIMsgFolder));

        if (destIMsgFolder) {
          destIMsgFolder->GetURI(folderUri);
          filterAction->SetTargetFolderUri(folderUri);
          moveValue.Assign(folderUri);
        }
      }
    }
  } else
    filterAction->SetTargetFolderUri(moveValue);

  return NS_OK;
  // set m_action.m_value.m_folderUri
}

NS_IMETHODIMP
nsMsgFilter::SaveToTextFile(nsIOutputStream* aStream) {
  NS_ENSURE_ARG_POINTER(aStream);
  if (m_unparseable) {
    uint32_t bytesWritten;
    // we need to trim leading whitespaces before filing out
    m_unparsedBuffer.Trim(kWhitespace, true /*leadingCharacters*/,
                          false /*trailingCharacters*/);
    return aStream->Write(m_unparsedBuffer.get(), m_unparsedBuffer.Length(),
                          &bytesWritten);
  }
  nsresult err = m_filterList->WriteWstrAttr(nsIMsgFilterList::attribName,
                                             m_filterName.get(), aStream);
  err = m_filterList->WriteBoolAttr(nsIMsgFilterList::attribEnabled, m_enabled,
                                    aStream);
  err = m_filterList->WriteStrAttr(nsIMsgFilterList::attribDescription,
                                   m_description.get(), aStream);
  err =
      m_filterList->WriteIntAttr(nsIMsgFilterList::attribType, m_type, aStream);
  if (IsScript())
    err = m_filterList->WriteStrAttr(nsIMsgFilterList::attribScriptFile,
                                     m_scriptFileName.get(), aStream);
  else
    err = SaveRule(aStream);
  return err;
}

nsresult nsMsgFilter::SaveRule(nsIOutputStream* aStream) {
  nsresult err = NS_OK;
  nsCOMPtr<nsIMsgFilterList> filterList;
  GetFilterList(getter_AddRefs(filterList));
  nsAutoCString actionFilingStr;

  uint32_t numActions;
  err = GetActionCount(&numActions);
  NS_ENSURE_SUCCESS(err, err);

  for (uint32_t index = 0; index < numActions; index++) {
    nsCOMPtr<nsIMsgRuleAction> action;
    err = GetActionAt(index, getter_AddRefs(action));
    if (NS_FAILED(err) || !action) continue;

    nsMsgRuleActionType actionType;
    action->GetType(&actionType);
    GetActionFilingStr(actionType, actionFilingStr);

    err = filterList->WriteStrAttr(nsIMsgFilterList::attribAction,
                                   actionFilingStr.get(), aStream);
    NS_ENSURE_SUCCESS(err, err);

    switch (actionType) {
      case nsMsgFilterAction::MoveToFolder:
      case nsMsgFilterAction::CopyToFolder: {
        nsCString imapTargetString;
        action->GetTargetFolderUri(imapTargetString);
        err = filterList->WriteStrAttr(nsIMsgFilterList::attribActionValue,
                                       imapTargetString.get(), aStream);
      } break;
      case nsMsgFilterAction::ChangePriority: {
        nsMsgPriorityValue priorityValue;
        action->GetPriority(&priorityValue);
        nsAutoCString priority;
        NS_MsgGetUntranslatedPriorityName(priorityValue, priority);
        err = filterList->WriteStrAttr(nsIMsgFilterList::attribActionValue,
                                       priority.get(), aStream);
      } break;
      case nsMsgFilterAction::JunkScore: {
        int32_t junkScore;
        action->GetJunkScore(&junkScore);
        err = filterList->WriteIntAttr(nsIMsgFilterList::attribActionValue,
                                       junkScore, aStream);
      } break;
      case nsMsgFilterAction::AddTag:
      case nsMsgFilterAction::Reply:
      case nsMsgFilterAction::Forward: {
        nsCString strValue;
        action->GetStrValue(strValue);
        // strValue is e-mail address
        err = filterList->WriteStrAttr(nsIMsgFilterList::attribActionValue,
                                       strValue.get(), aStream);
      } break;
      case nsMsgFilterAction::Custom: {
        nsAutoCString id;
        action->GetCustomId(id);
        err = filterList->WriteStrAttr(nsIMsgFilterList::attribCustomId,
                                       id.get(), aStream);
        nsAutoCString strValue;
        action->GetStrValue(strValue);
        if (strValue.Length())
          err = filterList->WriteWstrAttr(nsIMsgFilterList::attribActionValue,
                                          NS_ConvertUTF8toUTF16(strValue).get(),
                                          aStream);
      } break;

      default:
        break;
    }
    NS_ENSURE_SUCCESS(err, err);
  }
  // and here the fun begins - file out term list...
  nsAutoCString condition;
  err = MsgTermListToString(m_termList, condition);
  NS_ENSURE_SUCCESS(err, err);
  return filterList->WriteStrAttr(nsIMsgFilterList::attribCondition,
                                  condition.get(), aStream);
}

// for each action, this table encodes the filterTypes that support the action.
struct RuleActionsTableEntry {
  nsMsgRuleActionType action;
  const char*
      actionFilingStr; /* used for filing out filters, don't translate! */
};

static struct RuleActionsTableEntry ruleActionsTable[] = {
    {nsMsgFilterAction::MoveToFolder, "Move to folder"},
    {nsMsgFilterAction::CopyToFolder, "Copy to folder"},
    {nsMsgFilterAction::ChangePriority, "Change priority"},
    {nsMsgFilterAction::Delete, "Delete"},
    {nsMsgFilterAction::MarkRead, "Mark read"},
    {nsMsgFilterAction::KillThread, "Ignore thread"},
    {nsMsgFilterAction::KillSubthread, "Ignore subthread"},
    {nsMsgFilterAction::WatchThread, "Watch thread"},
    {nsMsgFilterAction::MarkFlagged, "Mark flagged"},
    {nsMsgFilterAction::Reply, "Reply"},
    {nsMsgFilterAction::Forward, "Forward"},
    {nsMsgFilterAction::StopExecution, "Stop execution"},
    {nsMsgFilterAction::DeleteFromPop3Server, "Delete from Pop3 server"},
    {nsMsgFilterAction::LeaveOnPop3Server, "Leave on Pop3 server"},
    {nsMsgFilterAction::JunkScore, "JunkScore"},
    {nsMsgFilterAction::FetchBodyFromPop3Server, "Fetch body from Pop3Server"},
    {nsMsgFilterAction::AddTag, "AddTag"},
    {nsMsgFilterAction::MarkUnread, "Mark unread"},
    {nsMsgFilterAction::Custom, "Custom"},
};

static const unsigned int sNumActions = std::size(ruleActionsTable);

const char* nsMsgFilter::GetActionStr(nsMsgRuleActionType action) {
  for (unsigned int i = 0; i < sNumActions; i++) {
    if (action == ruleActionsTable[i].action)
      return ruleActionsTable[i].actionFilingStr;
  }
  return "";
}
/*static */ nsresult nsMsgFilter::GetActionFilingStr(nsMsgRuleActionType action,
                                                     nsCString& actionStr) {
  for (unsigned int i = 0; i < sNumActions; i++) {
    if (action == ruleActionsTable[i].action) {
      actionStr = ruleActionsTable[i].actionFilingStr;
      return NS_OK;
    }
  }
  return NS_ERROR_INVALID_ARG;
}

nsMsgRuleActionType nsMsgFilter::GetActionForFilingStr(nsCString& actionStr) {
  for (unsigned int i = 0; i < sNumActions; i++) {
    if (actionStr.Equals(ruleActionsTable[i].actionFilingStr))
      return ruleActionsTable[i].action;
  }
  return nsMsgFilterAction::None;
}

int16_t nsMsgFilter::GetVersion() {
  if (!m_filterList) return 0;
  int16_t version;
  m_filterList->GetVersion(&version);
  return version;
}

#ifdef DEBUG
void nsMsgFilter::Dump() {
  nsAutoCString s;
  LossyCopyUTF16toASCII(m_filterName, s);
  printf("filter %s type = %c desc = %s\n", s.get(), m_type + '0',
         m_description.get());
}
#endif

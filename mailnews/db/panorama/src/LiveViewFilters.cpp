/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "LiveViewFilters.h"

#include "nsIMsgSearchTerm.h"
#include "nsPrintfCString.h"
#include "prtime.h"

using mozilla::storage::IntegerVariant;
using mozilla::storage::UTF8TextVariant;

namespace mozilla::mailnews {

void VirtualFolderFilter::Refresh() {
  mSQLClause.Assign(
      "folderId IN (SELECT searchFolderId FROM virtualFolder_folders WHERE "
      "virtualFolderId = ");
  mSQLClause.AppendInt(mVirtualFolderId);
  mSQLClause.Append(")");

  mSearchFolderIds = mWrapper->GetSearchFolderIds();

  nsTArray<RefPtr<nsIMsgSearchTerm>> searchTerms;
  mWrapper->GetSearchTerms(searchTerms);
  if (searchTerms.IsEmpty()) {
    return;
  }

  mSQLClause.Append(" AND (");
  for (size_t i = 0; i < searchTerms.Length(); i++) {
    if (i > 0) {
      bool booleanAnd;
      searchTerms[i]->GetBooleanAnd(&booleanAnd);
      if (booleanAnd) {
        mSQLClause.Append(" AND ");
      } else {
        mSQLClause.Append(" OR ");
      }
    }

    bool matchAll;
    searchTerms[i]->GetMatchAll(&matchAll);
    if (matchAll) {
      mSQLClause.Append("1");
      continue;
    }

    nsAutoCString clause;
    nsCOMPtr<nsIVariant> param;

    nsMsgSearchAttribValue attrib;
    searchTerms[i]->GetAttrib(&attrib);
    nsMsgSearchOpValue op;
    searchTerms[i]->GetOp(&op);
    nsCOMPtr<nsIMsgSearchValue> value;
    searchTerms[i]->GetValue(getter_AddRefs(value));

    switch (attrib) {
      case nsMsgSearchAttrib::Date: {
        clause = "DATE(date / 1000000, 'unixepoch', 'localtime')"_ns;

        PRTime timeValue;
        value->GetDate(&timeValue);
        PRExplodedTime explodedTimeValue;
        PR_ExplodeTime(timeValue, PR_LocalTimeParameters, &explodedTimeValue);

        char buf[11];
        PR_FormatTime(buf, 11, "%Y-%m-%d", &explodedTimeValue);
        param = new UTF8TextVariant(nsAutoCString(buf));
        break;
      }
      case nsMsgSearchAttrib::Sender:
        clause = "sender"_ns;
        break;
      case nsMsgSearchAttrib::To:
        clause = "recipients"_ns;
        break;
      case nsMsgSearchAttrib::CC:
        clause = "ccList"_ns;
        break;
      case nsMsgSearchAttrib::Subject:
        clause = "subject"_ns;
        break;
      case nsMsgSearchAttrib::HasAttachmentStatus:
        clause = nsPrintfCString("flags & %u", nsMsgMessageFlags::Attachment);
        param = new IntegerVariant(nsMsgMessageFlags::Attachment);
        break;
      case nsMsgSearchAttrib::Keywords:
        if (op != nsMsgSearchOp::Contains &&
            op != nsMsgSearchOp::DoesntContain) {
          clause = "tags"_ns;
        }
        break;
      default:
        MOZ_ASSERT(false, "unimplemented search attribute");
    }

    bool escape = false;

    switch (op) {
      case nsMsgSearchOp::Contains:
        if (attrib == nsMsgSearchAttrib::Keywords) {
          clause = "TAGS_INCLUDE(tags, ?)";
        } else {
          clause.Append(" LIKE ? ESCAPE '/'");
          escape = true;
        }
        break;
      case nsMsgSearchOp::DoesntContain:
        if (attrib == nsMsgSearchAttrib::Keywords) {
          clause = "TAGS_EXCLUDE(tags, ?)";
        } else {
          clause.Append(" NOT LIKE ? ESCAPE '/'");
          escape = true;
        }
        break;
      case nsMsgSearchOp::BeginsWith:
        clause.Append(" LIKE ? ESCAPE '/'");
        escape = true;
        break;
      case nsMsgSearchOp::EndsWith:
        clause.Append(" LIKE ? ESCAPE '/'");
        escape = true;
        break;
      case nsMsgSearchOp::Is:
        clause.Append(" = ?");
        break;
      case nsMsgSearchOp::Isnt:
        clause.Append(" != ?");
        break;
      case nsMsgSearchOp::IsEmpty:
        clause.Append(" = ''");
        break;
      case nsMsgSearchOp::IsntEmpty:
        clause.Append(" != ''");
        break;
      case nsMsgSearchOp::IsBefore:
      case nsMsgSearchOp::IsLowerThan:
      case nsMsgSearchOp::IsLessThan:
        clause.Append(" < ?");
        break;
      case nsMsgSearchOp::IsAfter:
      case nsMsgSearchOp::IsHigherThan:
      case nsMsgSearchOp::IsGreaterThan:
        clause.Append(" > ?");
        break;
      default:
        MOZ_ASSERT(false, "unimplemented search operator");
    }

    if (!param && op != nsMsgSearchOp::IsEmpty &&
        op != nsMsgSearchOp::IsntEmpty) {
      nsAutoCString strValue;
      value->GetUtf8Str(strValue);

      if (escape) {
        nsAutoCString escapedValue;
        // From `EscapeUTF8StringForLIKE` but without the need for a statement.
        for (uint32_t i = 0; i < strValue.Length(); i++) {
          if (strValue[i] == '/' || strValue[i] == '%' || strValue[i] == '_') {
            escapedValue += '/';
          }
          escapedValue += strValue[i];
        }

        if (op != nsMsgSearchOp::BeginsWith) {
          escapedValue.Insert('%', 0);
        }
        if (op != nsMsgSearchOp::EndsWith) {
          escapedValue.Append('%');
        }

        param = new UTF8TextVariant(escapedValue);
      } else {
        param = new UTF8TextVariant(strValue);
      }
    }

    mSQLClause.Append(clause);
    if (param) {
      mSQLParams.AppendElement(param);
    }
  }

  mSQLClause.Append(")");
}

}  // namespace mozilla::mailnews

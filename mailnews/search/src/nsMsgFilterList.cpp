/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this file implements the nsMsgFilterList interface

#include "msgCore.h"
#include "nsMsgFilterList.h"
#include "nsMsgFilter.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFilterHitNotify.h"
#include "nsMsgUtils.h"
#include "nsMsgSearchTerm.h"
#include "nsString.h"
#include "nsLocalFile.h"
#include "nsIMsgFilterService.h"
#include "nsMsgSearchScopeTerm.h"
#include "nsIStringBundle.h"
#include "nsNetUtil.h"
#include "nsIInputStream.h"
#include "nsNativeCharsetUtils.h"
#include "prmem.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/intl/AppDateTimeFormat.h"
#include <ctype.h>

// Marker for EOF or failure during read
#define EOF_CHAR -1

using namespace mozilla;

extern LazyLogModule FILTERLOGMODULE;

static uint32_t nextListId = 0;

nsMsgFilterList::nsMsgFilterList() : m_fileVersion(0) {
  m_loggingEnabled = false;
  m_startWritingToBuffer = false;
  m_temporaryList = false;
  m_curFilter = nullptr;
  m_listId.Assign("List");
  m_listId.AppendInt(nextListId++);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Creating a new filter list with id=%s", m_listId.get()));
}

NS_IMPL_ADDREF(nsMsgFilterList)
NS_IMPL_RELEASE(nsMsgFilterList)
NS_IMPL_QUERY_INTERFACE(nsMsgFilterList, nsIMsgFilterList)

NS_IMETHODIMP nsMsgFilterList::CreateFilter(const nsAString& name,
                                            class nsIMsgFilter** aFilter) {
  NS_ENSURE_ARG_POINTER(aFilter);

  NS_ADDREF(*aFilter = new nsMsgFilter);

  (*aFilter)->SetFilterName(name);
  (*aFilter)->SetFilterList(this);

  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::SetLoggingEnabled(bool enabled) {
  if (!enabled) {
    // Disabling logging has side effect of closing logfile (if open).
    SetLogStream(nullptr);
  }
  m_loggingEnabled = enabled;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::GetLoggingEnabled(bool* enabled) {
  *enabled = m_loggingEnabled;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::GetListId(nsACString& aListId) {
  aListId.Assign(m_listId);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::GetFolder(nsIMsgFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  NS_IF_ADDREF(*aFolder = m_folder);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::SetFolder(nsIMsgFolder* aFolder) {
  m_folder = aFolder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::SaveToFile(nsIOutputStream* stream) {
  if (!stream) return NS_ERROR_NULL_POINTER;
  return SaveTextFilters(stream);
}

#define LOG_HEADER                                                     \
  "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<style " \
  "type=\"text/css\">body{font-family:Consolas,\"Lucida "              \
  "Console\",Monaco,\"Courier "                                        \
  "New\",Courier,monospace;font-size:small}</style>\n</head>\n<body>\n"
#define LOG_HEADER_LEN (strlen(LOG_HEADER))

nsresult nsMsgFilterList::EnsureLogFile(nsIFile* file) {
  bool exists;
  nsresult rv = file->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists) {
    rv = file->Create(nsIFile::NORMAL_FILE_TYPE, 0666);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  int64_t fileSize;
  rv = file->GetFileSize(&fileSize);
  NS_ENSURE_SUCCESS(rv, rv);

  // write the header at the start
  if (fileSize == 0) {
    nsCOMPtr<nsIOutputStream> outputStream;
    rv = MsgGetFileStream(file, getter_AddRefs(outputStream));
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t writeCount;
    rv = outputStream->Write(LOG_HEADER, LOG_HEADER_LEN, &writeCount);
    NS_ASSERTION(writeCount == LOG_HEADER_LEN,
                 "failed to write out log header");
    NS_ENSURE_SUCCESS(rv, rv);
    outputStream->Close();
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::ClearLog() {
  bool loggingEnabled = m_loggingEnabled;

  // disable logging while clearing (and close logStream if open).
  SetLoggingEnabled(false);

  nsCOMPtr<nsIFile> file;
  if (NS_SUCCEEDED(GetLogFile(getter_AddRefs(file)))) {
    file->Remove(false);
    // Recreate the file, with just the html header.
    EnsureLogFile(file);
  }

  SetLoggingEnabled(loggingEnabled);
  return NS_OK;
}

nsresult nsMsgFilterList::GetLogFile(nsIFile** aFile) {
  NS_ENSURE_ARG_POINTER(aFile);

  // XXX todo
  // the path to the log file won't change
  // should we cache it?
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = m_folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString type;
  rv = server->GetType(type);
  NS_ENSURE_SUCCESS(rv, rv);

  bool isServer = false;
  rv = m_folder->GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  // for news folders (not servers), the filter file is
  // mcom.test.dat
  // where the summary file is
  // mcom.test.msf
  // since the log is an html file we make it
  // mcom.test.htm
  if (type.EqualsLiteral("nntp") && !isServer) {
    nsCOMPtr<nsIFile> thisFolder;
    rv = m_folder->GetFilePath(getter_AddRefs(thisFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIFile> filterLogFile = new nsLocalFile();
    rv = filterLogFile->InitWithFile(thisFolder);
    NS_ENSURE_SUCCESS(rv, rv);

    // NOTE:
    // we don't we need to call NS_MsgHashIfNecessary()
    // it's already been hashed, if necessary
    nsAutoString filterLogName;
    rv = filterLogFile->GetLeafName(filterLogName);
    NS_ENSURE_SUCCESS(rv, rv);

    filterLogName.AppendLiteral(u".htm");

    rv = filterLogFile->SetLeafName(filterLogName);
    NS_ENSURE_SUCCESS(rv, rv);

    filterLogFile.forget(aFile);
  } else {
    rv = server->GetLocalPath(aFile);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = (*aFile)->AppendNative("filterlog.html"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return EnsureLogFile(*aFile);
}

NS_IMETHODIMP
nsMsgFilterList::GetLogURL(nsACString& aLogURL) {
  nsCOMPtr<nsIFile> file;
  nsresult rv = GetLogFile(getter_AddRefs(file));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_GetURLSpecFromFile(file, aLogURL);
  NS_ENSURE_SUCCESS(rv, rv);

  return !aLogURL.IsEmpty() ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP
nsMsgFilterList::SetLogStream(nsIOutputStream* aLogStream) {
  // if there is a log stream already, close it
  if (m_logStream) {
    m_logStream->Close();  // will flush
  }

  m_logStream = aLogStream;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterList::GetLogStream(nsIOutputStream** aLogStream) {
  NS_ENSURE_ARG_POINTER(aLogStream);

  if (!m_logStream && m_loggingEnabled) {
    nsCOMPtr<nsIFile> logFile;
    nsresult rv = GetLogFile(getter_AddRefs(logFile));
    if (NS_SUCCEEDED(rv)) {
      // Make sure it exists and has it's initial header.
      rv = EnsureLogFile(logFile);
      if (NS_SUCCEEDED(rv)) {
        // append to the end of the log file
        rv = MsgNewBufferedFileOutputStream(
            getter_AddRefs(m_logStream), logFile,
            PR_CREATE_FILE | PR_WRONLY | PR_APPEND, 0666);
      }
    }
    if (NS_FAILED(rv)) {
      m_logStream = nullptr;
    }
  }

  // Always returns NS_OK. The stream can be null.
  NS_IF_ADDREF(*aLogStream = m_logStream);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterList::ApplyFiltersToHdr(nsMsgFilterTypeType filterType,
                                   nsIMsgDBHdr* msgHdr, nsIMsgFolder* folder,
                                   nsIMsgDatabase* db,
                                   const nsACString& headers,
                                   nsIMsgFilterHitNotify* listener,
                                   nsIMsgWindow* msgWindow) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Auto) nsMsgFilterList::ApplyFiltersToHdr"));
  if (!msgHdr) {
    // Sometimes we get here with no header, so let's not crash on that
    // later on.
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
            ("(Auto) Called with NULL message header, nothing to do"));
    return NS_ERROR_NULL_POINTER;
  }

  nsCOMPtr<nsIMsgFilter> filter;
  uint32_t filterCount = 0;
  nsresult rv = GetFilterCount(&filterCount);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsMsgSearchScopeTerm> scope =
      new nsMsgSearchScopeTerm(nullptr, nsMsgSearchScope::offlineMail, folder);

  nsString folderName;
  folder->GetName(folderName);
  nsMsgKey msgKey;
  msgHdr->GetMessageKey(&msgKey);
  nsCString typeName;
  nsCOMPtr<nsIMsgFilterService> filterService =
      do_GetService("@mozilla.org/messenger/services/filters;1", &rv);
  filterService->FilterTypeName(filterType, typeName);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Auto) Filter run initiated, trigger=%s (%i)", typeName.get(),
           filterType));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Auto) Running %" PRIu32
           " filters from %s on message with key %" PRIu32 " in folder '%s'",
           filterCount, m_listId.get(), msgKeyToInt(msgKey),
           NS_ConvertUTF16toUTF8(folderName).get()));

  for (uint32_t filterIndex = 0; filterIndex < filterCount; filterIndex++) {
    if (NS_SUCCEEDED(GetFilterAt(filterIndex, getter_AddRefs(filter)))) {
      bool isEnabled;
      nsMsgFilterTypeType curFilterType;

      filter->GetEnabled(&isEnabled);
      if (!isEnabled) {
        // clang-format off
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Auto) Skipping disabled filter at index %" PRIu32,
                 filterIndex));
        // clang-format on
        continue;
      }

      nsString filterName;
      filter->GetFilterName(filterName);
      filter->GetFilterType(&curFilterType);
      if (curFilterType & filterType) {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Auto) Running filter %" PRIu32, filterIndex));
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
                ("(Auto) Filter name: %s",
                 NS_ConvertUTF16toUTF8(filterName).get()));

        nsresult matchTermStatus = NS_OK;
        bool result = false;

        filter->SetScope(scope);
        matchTermStatus =
            filter->MatchHdr(msgHdr, folder, db, headers, &result);
        filter->SetScope(nullptr);
        if (NS_SUCCEEDED(matchTermStatus) && result && listener) {
          nsCString msgId;
          msgHdr->GetMessageId(msgId);
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                  ("(Auto) Filter matched message with key %" PRIu32,
                   msgKeyToInt(msgKey)));
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
                  ("(Auto) Matched message ID: %s", msgId.get()));

          bool applyMore = true;
          rv = listener->ApplyFilterHit(filter, msgWindow, &applyMore);
          if (NS_FAILED(rv)) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                    ("(Auto) Applying filter actions failed"));
            LogFilterMessage(u"Applying filter actions failed"_ns, filter);
          } else {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Auto) Applying filter actions succeeded"));
          }
          if (NS_FAILED(rv) || !applyMore) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Auto) Stopping further filter execution"
                     " on this message"));
            break;
          }
        } else {
          if (NS_FAILED(matchTermStatus)) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                    ("(Auto) Filter evaluation failed"));
            LogFilterMessage(u"Filter evaluation failed"_ns, filter);
          }
          if (!result)
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Auto) Filter didn't match"));
        }
      } else {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Auto) Skipping filter of non-matching type"
                 " at index %" PRIu32,
                 filterIndex));
      }
    }
  }
  if (NS_FAILED(rv)) {
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
            ("(Auto) Filter run failed (%" PRIx32 ")", static_cast<uint32_t>(rv)));
    // clang-format on
    LogFilterMessage(u"Filter run failed"_ns, nullptr);
  }
  return rv;
}

NS_IMETHODIMP
nsMsgFilterList::SetDefaultFile(nsIFile* aFile) {
  m_defaultFile = aFile;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterList::GetDefaultFile(nsIFile** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  NS_IF_ADDREF(*aResult = m_defaultFile);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterList::SaveToDefaultFile() {
  nsresult rv;
  nsCOMPtr<nsIMsgFilterService> filterService =
      do_GetService("@mozilla.org/messenger/services/filters;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return filterService->SaveFilterList(this, m_defaultFile);
}

typedef struct {
  nsMsgFilterFileAttribValue attrib;
  const char* attribName;
} FilterFileAttribEntry;

static FilterFileAttribEntry FilterFileAttribTable[] = {
    {nsIMsgFilterList::attribNone, ""},
    {nsIMsgFilterList::attribVersion, "version"},
    {nsIMsgFilterList::attribLogging, "logging"},
    {nsIMsgFilterList::attribName, "name"},
    {nsIMsgFilterList::attribEnabled, "enabled"},
    {nsIMsgFilterList::attribDescription, "description"},
    {nsIMsgFilterList::attribType, "type"},
    {nsIMsgFilterList::attribScriptFile, "scriptName"},
    {nsIMsgFilterList::attribAction, "action"},
    {nsIMsgFilterList::attribActionValue, "actionValue"},
    {nsIMsgFilterList::attribCondition, "condition"},
    {nsIMsgFilterList::attribCustomId, "customId"},
};

static const unsigned int sNumFilterFileAttribTable =
    std::size(FilterFileAttribTable);

// If we want to buffer file IO, wrap it in here.
int nsMsgFilterList::ReadChar(nsIInputStream* aStream) {
  char newChar;
  uint32_t bytesRead;
  uint64_t bytesAvailable;
  nsresult rv = aStream->Available(&bytesAvailable);
  if (NS_FAILED(rv) || bytesAvailable == 0) return EOF_CHAR;

  rv = aStream->Read(&newChar, 1, &bytesRead);
  if (NS_FAILED(rv) || !bytesRead) return EOF_CHAR;

  if (m_startWritingToBuffer) m_unparsedFilterBuffer.Append(newChar);
  return (unsigned char)newChar;  // Make sure the char is unsigned.
}

int nsMsgFilterList::SkipWhitespace(nsIInputStream* aStream) {
  int ch;
  do {
    ch = ReadChar(aStream);
  } while (!(ch & 0x80) &&
           isspace(ch));  // isspace can crash with non-ascii input

  return ch;
}

bool nsMsgFilterList::StrToBool(nsCString& str) {
  return str.EqualsLiteral("yes");
}

int nsMsgFilterList::LoadAttrib(nsMsgFilterFileAttribValue& attrib,
                                nsIInputStream* aStream) {
  char attribStr[100];
  int curChar;
  attrib = nsIMsgFilterList::attribNone;

  curChar = SkipWhitespace(aStream);
  int i;
  for (i = 0; i + 1 < (int)(sizeof(attribStr));) {
    if (curChar == EOF_CHAR || (!(curChar & 0x80) && isspace(curChar)) ||
        curChar == '=')
      break;
    attribStr[i++] = curChar;
    curChar = ReadChar(aStream);
  }
  attribStr[i] = '\0';
  for (unsigned int tableIndex = 0; tableIndex < sNumFilterFileAttribTable;
       tableIndex++) {
    if (!PL_strcasecmp(attribStr,
                       FilterFileAttribTable[tableIndex].attribName)) {
      attrib = FilterFileAttribTable[tableIndex].attrib;
      break;
    }
  }
  return curChar;
}

const char* nsMsgFilterList::GetStringForAttrib(
    nsMsgFilterFileAttribValue attrib) {
  for (unsigned int tableIndex = 0; tableIndex < sNumFilterFileAttribTable;
       tableIndex++) {
    if (attrib == FilterFileAttribTable[tableIndex].attrib)
      return FilterFileAttribTable[tableIndex].attribName;
  }
  return nullptr;
}

nsresult nsMsgFilterList::LoadValue(nsCString& value, nsIInputStream* aStream) {
  nsAutoCString valueStr;
  int curChar;
  value = "";
  curChar = SkipWhitespace(aStream);
  if (curChar != '"') {
    NS_ASSERTION(false, "expecting quote as start of value");
    return NS_MSG_FILTER_PARSE_ERROR;
  }
  curChar = ReadChar(aStream);
  do {
    if (curChar == '\\') {
      int nextChar = ReadChar(aStream);
      if (nextChar == '"')
        curChar = '"';
      else if (nextChar == '\\')  // replace "\\" with "\"
      {
        valueStr += curChar;
        curChar = ReadChar(aStream);
      } else {
        valueStr += curChar;
        curChar = nextChar;
      }
    } else {
      if (curChar == EOF_CHAR || curChar == '"' || curChar == '\n' ||
          curChar == '\r') {
        value += valueStr;
        break;
      }
    }
    valueStr += curChar;
    curChar = ReadChar(aStream);
  } while (curChar != EOF_CHAR);
  return NS_OK;
}

nsresult nsMsgFilterList::LoadTextFilters(
    already_AddRefed<nsIInputStream> aStream) {
  nsresult err = NS_OK;
  uint64_t bytesAvailable;

  nsCOMPtr<nsIInputStream> bufStream;
  nsCOMPtr<nsIInputStream> stream = std::move(aStream);
  err = NS_NewBufferedInputStream(getter_AddRefs(bufStream), stream.forget(),
                                  FILE_IO_BUFFER_SIZE);
  NS_ENSURE_SUCCESS(err, err);

  nsMsgFilterFileAttribValue attrib;
  nsCOMPtr<nsIMsgRuleAction> currentFilterAction;
  // We'd really like to move lot's of these into the objects that they refer
  // to.
  do {
    nsAutoCString value;
    nsresult intToStringResult;

    int curChar;
    curChar = LoadAttrib(attrib, bufStream);
    if (curChar == EOF_CHAR)  // reached eof
      break;
    err = LoadValue(value, bufStream);
    if (NS_FAILED(err)) break;

    switch (attrib) {
      case nsIMsgFilterList::attribNone:
        if (m_curFilter) m_curFilter->SetUnparseable(true);
        break;
      case nsIMsgFilterList::attribVersion:
        m_fileVersion = value.ToInteger(&intToStringResult);
        if (NS_FAILED(intToStringResult)) {
          attrib = nsIMsgFilterList::attribNone;
          NS_ASSERTION(false, "error parsing filter file version");
        }
        break;
      case nsIMsgFilterList::attribLogging:
        m_loggingEnabled = StrToBool(value);
        // We are going to buffer each filter as we read them.
        // Make sure no garbage is there
        m_unparsedFilterBuffer.Truncate();
        m_startWritingToBuffer = true;  // filters begin now
        break;
      case nsIMsgFilterList::attribName:  // every filter starts w/ a name
      {
        if (m_curFilter) {
          int32_t nextFilterStartPos = m_unparsedFilterBuffer.RFind("name");

          nsAutoCString nextFilterPart;
          nextFilterPart = Substring(m_unparsedFilterBuffer, nextFilterStartPos,
                                     m_unparsedFilterBuffer.Length());
          m_unparsedFilterBuffer.SetLength(nextFilterStartPos);

          bool unparseableFilter;
          m_curFilter->GetUnparseable(&unparseableFilter);
          if (unparseableFilter) {
            m_curFilter->SetUnparsedBuffer(m_unparsedFilterBuffer);
            m_curFilter->SetEnabled(false);  // disable the filter because we
                                             // don't know how to apply it
          }
          m_unparsedFilterBuffer = nextFilterPart;
        }
        nsMsgFilter* filter = new nsMsgFilter;
        if (filter == nullptr) {
          err = NS_ERROR_OUT_OF_MEMORY;
          break;
        }
        filter->SetFilterList(static_cast<nsIMsgFilterList*>(this));
        nsAutoString unicodeStr;
        if (m_fileVersion == k45Version) {
          NS_CopyNativeToUnicode(value, unicodeStr);
          filter->SetFilterName(unicodeStr);
        } else {
          CopyUTF8toUTF16(value, unicodeStr);
          filter->SetFilterName(unicodeStr);
        }
        m_curFilter = filter;
        m_filters.AppendElement(filter);
      } break;
      case nsIMsgFilterList::attribEnabled:
        if (m_curFilter) m_curFilter->SetEnabled(StrToBool(value));
        break;
      case nsIMsgFilterList::attribDescription:
        if (m_curFilter) m_curFilter->SetFilterDesc(value);
        break;
      case nsIMsgFilterList::attribType:
        if (m_curFilter) {
          // Older versions of filters didn't have the ability to turn on/off
          // the manual filter context, so default manual to be on in that case
          int32_t filterType = value.ToInteger(&intToStringResult);
          if (m_fileVersion < kManualContextVersion)
            filterType |= nsMsgFilterType::Manual;
          m_curFilter->SetType((nsMsgFilterTypeType)filterType);
        }
        break;
      case nsIMsgFilterList::attribScriptFile:
        if (m_curFilter) m_curFilter->SetFilterScript(&value);
        break;
      case nsIMsgFilterList::attribAction:
        if (m_curFilter) {
          nsMsgRuleActionType actionType =
              nsMsgFilter::GetActionForFilingStr(value);
          if (actionType == nsMsgFilterAction::None)
            m_curFilter->SetUnparseable(true);
          else {
            err =
                m_curFilter->CreateAction(getter_AddRefs(currentFilterAction));
            NS_ENSURE_SUCCESS(err, err);
            currentFilterAction->SetType(actionType);
            m_curFilter->AppendAction(currentFilterAction);
          }
        }
        break;
      case nsIMsgFilterList::attribActionValue:
        if (m_curFilter && currentFilterAction) {
          nsMsgRuleActionType type;
          currentFilterAction->GetType(&type);
          if (type == nsMsgFilterAction::MoveToFolder ||
              type == nsMsgFilterAction::CopyToFolder)
            err = m_curFilter->ConvertMoveOrCopyToFolderValue(
                currentFilterAction, value);
          else if (type == nsMsgFilterAction::ChangePriority) {
            nsMsgPriorityValue outPriority;
            nsresult res =
                NS_MsgGetPriorityFromString(value.get(), outPriority);
            if (NS_SUCCEEDED(res))
              currentFilterAction->SetPriority(outPriority);
            else
              NS_ASSERTION(false, "invalid priority in filter file");
          } else if (type == nsMsgFilterAction::JunkScore) {
            nsresult res;
            int32_t junkScore = value.ToInteger(&res);
            if (NS_SUCCEEDED(res)) currentFilterAction->SetJunkScore(junkScore);
          } else if (type == nsMsgFilterAction::Forward ||
                     type == nsMsgFilterAction::Reply ||
                     type == nsMsgFilterAction::AddTag ||
                     type == nsMsgFilterAction::Custom) {
            currentFilterAction->SetStrValue(value);
          }
        }
        break;
      case nsIMsgFilterList::attribCondition:
        if (m_curFilter) {
          if (m_fileVersion == k45Version) {
            nsAutoString unicodeStr;
            NS_CopyNativeToUnicode(value, unicodeStr);
            CopyUTF16toUTF8(unicodeStr, value);
          }
          err = ParseCondition(m_curFilter, value.get());
          if (err == NS_ERROR_INVALID_ARG)
            err = m_curFilter->SetUnparseable(true);
          NS_ENSURE_SUCCESS(err, err);
        }
        break;
      case nsIMsgFilterList::attribCustomId:
        if (m_curFilter && currentFilterAction) {
          err = currentFilterAction->SetCustomId(value);
          NS_ENSURE_SUCCESS(err, err);
        }
        break;
    }
  } while (NS_SUCCEEDED(bufStream->Available(&bytesAvailable)));

  if (m_curFilter) {
    bool unparseableFilter;
    m_curFilter->GetUnparseable(&unparseableFilter);
    if (unparseableFilter) {
      m_curFilter->SetUnparsedBuffer(m_unparsedFilterBuffer);
      m_curFilter->SetEnabled(
          false);  // disable the filter because we don't know how to apply it
    }
  }

  return err;
}

// parse condition like "(subject, contains, fred) AND (body, isn't, "foo)")"
// values with close parens will be quoted.
// what about values with close parens and quotes? e.g., (body, isn't, "foo")")
// I guess interior quotes will need to be escaped - ("foo\")")
// which will get written out as (\"foo\\")\") and read in as ("foo\")"
// ALL means match all messages.
NS_IMETHODIMP nsMsgFilterList::ParseCondition(nsIMsgFilter* aFilter,
                                              const char* aCondition) {
  NS_ENSURE_ARG_POINTER(aFilter);

  bool done = false;
  nsresult err = NS_OK;
  const char* curPtr = aCondition;
  if (!strcmp(aCondition, "ALL")) {
    RefPtr<nsMsgSearchTerm> newTerm = new nsMsgSearchTerm;
    newTerm->m_matchAll = true;
    aFilter->AppendTerm(newTerm);
    return NS_OK;
  }

  while (!done) {
    // insert code to save the boolean operator if there is one for this search
    // term....
    const char* openParen = PL_strchr(curPtr, '(');
    const char* orTermPos = PL_strchr(
        curPtr, 'O');  // determine if an "OR" appears b4 the openParen...
    bool ANDTerm = true;
    if (orTermPos &&
        orTermPos < openParen)  // make sure OR term falls before the '('
      ANDTerm = false;

    char* termDup = nullptr;
    if (openParen) {
      bool foundEndTerm = false;
      bool inQuote = false;
      for (curPtr = openParen + 1; *curPtr; curPtr++) {
        if (*curPtr == '\\' && *(curPtr + 1) == '"')
          curPtr++;
        else if (*curPtr == ')' && !inQuote) {
          foundEndTerm = true;
          break;
        } else if (*curPtr == '"')
          inQuote = !inQuote;
      }
      if (foundEndTerm) {
        int termLen = curPtr - openParen - 1;
        termDup = (char*)PR_Malloc(termLen + 1);
        if (termDup) {
          PL_strncpy(termDup, openParen + 1, termLen + 1);
          termDup[termLen] = '\0';
        } else {
          err = NS_ERROR_OUT_OF_MEMORY;
          break;
        }
      }
    } else
      break;
    if (termDup) {
      RefPtr<nsMsgSearchTerm> newTerm = new nsMsgSearchTerm;
      // Invert nsMsgSearchTerm::EscapeQuotesInStr()
      for (char *to = termDup, *from = termDup;;) {
        if (*from == '\\' && from[1] == '"') from++;
        if (!(*to++ = *from++)) break;
      }
      newTerm->m_booleanOp = (ANDTerm) ? nsMsgSearchBooleanOp::BooleanAND
                                       : nsMsgSearchBooleanOp::BooleanOR;

      err = newTerm->DeStreamNew(termDup, PL_strlen(termDup));
      NS_ENSURE_SUCCESS(err, err);
      aFilter->AppendTerm(newTerm);
      PR_FREEIF(termDup);
    } else
      break;
  }
  return err;
}

nsresult nsMsgFilterList::WriteIntAttr(nsMsgFilterFileAttribValue attrib,
                                       int value, nsIOutputStream* aStream) {
  nsresult rv = NS_OK;
  const char* attribStr = GetStringForAttrib(attrib);
  if (attribStr) {
    uint32_t bytesWritten;
    nsAutoCString writeStr(attribStr);
    writeStr.AppendLiteral("=\"");
    writeStr.AppendInt(value);
    writeStr.AppendLiteral("\"" MSG_LINEBREAK);
    rv = aStream->Write(writeStr.get(), writeStr.Length(), &bytesWritten);
  }
  return rv;
}

NS_IMETHODIMP
nsMsgFilterList::WriteStrAttr(nsMsgFilterFileAttribValue attrib,
                              const char* aStr, nsIOutputStream* aStream) {
  nsresult rv = NS_OK;
  if (aStr && *aStr &&
      aStream)  // only proceed if we actually have a string to write out.
  {
    char* escapedStr = nullptr;
    if (PL_strchr(aStr, '"'))
      escapedStr = nsMsgSearchTerm::EscapeQuotesInStr(aStr);

    const char* attribStr = GetStringForAttrib(attrib);
    if (attribStr) {
      uint32_t bytesWritten;
      nsAutoCString writeStr(attribStr);
      writeStr.AppendLiteral("=\"");
      writeStr.Append((escapedStr) ? escapedStr : aStr);
      writeStr.AppendLiteral("\"" MSG_LINEBREAK);
      rv = aStream->Write(writeStr.get(), writeStr.Length(), &bytesWritten);
    }
    PR_Free(escapedStr);
  }
  return rv;
}

nsresult nsMsgFilterList::WriteBoolAttr(nsMsgFilterFileAttribValue attrib,
                                        bool boolVal,
                                        nsIOutputStream* aStream) {
  return WriteStrAttr(attrib, (boolVal) ? "yes" : "no", aStream);
}

nsresult nsMsgFilterList::WriteWstrAttr(nsMsgFilterFileAttribValue attrib,
                                        const char16_t* aFilterName,
                                        nsIOutputStream* aStream) {
  WriteStrAttr(attrib, NS_ConvertUTF16toUTF8(aFilterName).get(), aStream);
  return NS_OK;
}

nsresult nsMsgFilterList::SaveTextFilters(nsIOutputStream* aStream) {
  uint32_t filterCount = 0;
  nsresult err = GetFilterCount(&filterCount);
  NS_ENSURE_SUCCESS(err, err);

  err = WriteIntAttr(nsIMsgFilterList::attribVersion, kFileVersion, aStream);
  NS_ENSURE_SUCCESS(err, err);
  err =
      WriteBoolAttr(nsIMsgFilterList::attribLogging, m_loggingEnabled, aStream);
  NS_ENSURE_SUCCESS(err, err);
  for (uint32_t i = 0; i < filterCount; i++) {
    nsCOMPtr<nsIMsgFilter> filter;
    if (NS_SUCCEEDED(GetFilterAt(i, getter_AddRefs(filter))) && filter) {
      filter->SetFilterList(this);

      // if the filter is temporary, don't write it to disk
      bool isTemporary;
      err = filter->GetTemporary(&isTemporary);
      if (NS_SUCCEEDED(err) && !isTemporary) {
        err = filter->SaveToTextFile(aStream);
        if (NS_FAILED(err)) break;
      }
    } else
      break;
  }
  if (NS_SUCCEEDED(err)) m_arbitraryHeaders.Truncate();
  return err;
}

nsMsgFilterList::~nsMsgFilterList() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Closing filter list %s", m_listId.get()));
}

nsresult nsMsgFilterList::Close() { return NS_ERROR_NOT_IMPLEMENTED; }

nsresult nsMsgFilterList::GetFilterCount(uint32_t* pCount) {
  NS_ENSURE_ARG_POINTER(pCount);

  *pCount = m_filters.Length();
  return NS_OK;
}

nsresult nsMsgFilterList::GetFilterAt(uint32_t filterIndex,
                                      nsIMsgFilter** filter) {
  NS_ENSURE_ARG_POINTER(filter);

  uint32_t filterCount = 0;
  GetFilterCount(&filterCount);
  NS_ENSURE_ARG(filterIndex < filterCount);

  NS_IF_ADDREF(*filter = m_filters[filterIndex]);
  return NS_OK;
}

nsresult nsMsgFilterList::GetFilterNamed(const nsAString& aName,
                                         nsIMsgFilter** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  uint32_t count = 0;
  nsresult rv = GetFilterCount(&count);
  NS_ENSURE_SUCCESS(rv, rv);

  *aResult = nullptr;
  for (uint32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIMsgFilter> filter;
    rv = GetFilterAt(i, getter_AddRefs(filter));
    if (NS_FAILED(rv)) continue;

    nsString filterName;
    filter->GetFilterName(filterName);
    if (filterName.Equals(aName)) {
      filter.forget(aResult);
      break;
    }
  }

  return NS_OK;
}

nsresult nsMsgFilterList::SetFilterAt(uint32_t filterIndex,
                                      nsIMsgFilter* filter) {
  m_filters[filterIndex] = filter;
  return NS_OK;
}

nsresult nsMsgFilterList::RemoveFilterAt(uint32_t filterIndex) {
  m_filters.RemoveElementAt(filterIndex);
  return NS_OK;
}

nsresult nsMsgFilterList::RemoveFilter(nsIMsgFilter* aFilter) {
  m_filters.RemoveElement(aFilter);
  return NS_OK;
}

nsresult nsMsgFilterList::InsertFilterAt(uint32_t filterIndex,
                                         nsIMsgFilter* aFilter) {
  if (!m_temporaryList) aFilter->SetFilterList(this);
  m_filters.InsertElementAt(filterIndex, aFilter);

  return NS_OK;
}

// Attempt to move the filter at index filterIndex in the specified direction.
// If motion not possible in that direction, we still return success.
// We could return an error if the FE's want to beep or something.
nsresult nsMsgFilterList::MoveFilterAt(uint32_t filterIndex,
                                       nsMsgFilterMotionValue motion) {
  NS_ENSURE_ARG((motion == nsMsgFilterMotion::up) ||
                (motion == nsMsgFilterMotion::down));

  uint32_t filterCount = 0;
  nsresult rv = GetFilterCount(&filterCount);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ENSURE_ARG(filterIndex < filterCount);

  uint32_t newIndex = filterIndex;

  if (motion == nsMsgFilterMotion::up) {
    // are we already at the top?
    if (filterIndex == 0) return NS_OK;

    newIndex = filterIndex - 1;
  } else if (motion == nsMsgFilterMotion::down) {
    // are we already at the bottom?
    if (filterIndex == filterCount - 1) return NS_OK;

    newIndex = filterIndex + 1;
  }

  nsCOMPtr<nsIMsgFilter> tempFilter1;
  rv = GetFilterAt(newIndex, getter_AddRefs(tempFilter1));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFilter> tempFilter2;
  rv = GetFilterAt(filterIndex, getter_AddRefs(tempFilter2));
  NS_ENSURE_SUCCESS(rv, rv);

  SetFilterAt(newIndex, tempFilter2);
  SetFilterAt(filterIndex, tempFilter1);

  return NS_OK;
}

nsresult nsMsgFilterList::MoveFilter(nsIMsgFilter* aFilter,
                                     nsMsgFilterMotionValue motion) {
  size_t filterIndex = m_filters.IndexOf(aFilter, 0);
  NS_ENSURE_ARG(filterIndex != m_filters.NoIndex);

  return MoveFilterAt(filterIndex, motion);
}

nsresult nsMsgFilterList::GetVersion(int16_t* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = m_fileVersion;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::MatchOrChangeFilterTarget(
    const nsACString& oldFolderUri, const nsACString& newFolderUri,
    bool caseInsensitive, bool* found) {
  NS_ENSURE_ARG_POINTER(found);

  uint32_t numFilters = 0;
  nsresult rv = GetFilterCount(&numFilters);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFilter> filter;
  nsCString folderUri;
  *found = false;
  for (uint32_t index = 0; index < numFilters; index++) {
    rv = GetFilterAt(index, getter_AddRefs(filter));
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t numActions;
    rv = filter->GetActionCount(&numActions);
    NS_ENSURE_SUCCESS(rv, rv);

    for (uint32_t actionIndex = 0; actionIndex < numActions; actionIndex++) {
      nsCOMPtr<nsIMsgRuleAction> filterAction;
      rv = filter->GetActionAt(actionIndex, getter_AddRefs(filterAction));
      if (NS_FAILED(rv) || !filterAction) continue;

      nsMsgRuleActionType actionType;
      if (NS_FAILED(filterAction->GetType(&actionType))) continue;

      if (actionType == nsMsgFilterAction::MoveToFolder ||
          actionType == nsMsgFilterAction::CopyToFolder) {
        rv = filterAction->GetTargetFolderUri(folderUri);
        if (NS_SUCCEEDED(rv) && !folderUri.IsEmpty()) {
          bool matchFound = false;
          if (caseInsensitive) {
            if (folderUri.Equals(oldFolderUri,
                                 nsCaseInsensitiveCStringComparator))  // local
              matchFound = true;
          } else {
            if (folderUri.Equals(oldFolderUri))  // imap
              matchFound = true;
          }
          if (matchFound) {
            *found = true;
            // if we just want to match the uri's, newFolderUri will be null
            if (!newFolderUri.IsEmpty()) {
              rv = filterAction->SetTargetFolderUri(newFolderUri);
              NS_ENSURE_SUCCESS(rv, rv);
            }
          }
        }
      }
    }
  }
  return rv;
}

// this would only return true if any filter was on "any header", which we
// don't support in 6.x
NS_IMETHODIMP nsMsgFilterList::GetShouldDownloadAllHeaders(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = false;
  return NS_OK;
}

// leaves m_arbitraryHeaders filed in with the arbitrary headers.
nsresult nsMsgFilterList::ComputeArbitraryHeaders() {
  NS_ENSURE_TRUE(m_arbitraryHeaders.IsEmpty(), NS_OK);

  uint32_t numFilters = 0;
  nsresult rv = GetFilterCount(&numFilters);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFilter> filter;
  nsMsgSearchAttribValue attrib;
  nsCString arbitraryHeader;
  for (uint32_t index = 0; index < numFilters; index++) {
    rv = GetFilterAt(index, getter_AddRefs(filter));
    if (!(NS_SUCCEEDED(rv) && filter)) continue;

    nsTArray<RefPtr<nsIMsgSearchTerm>> searchTerms;
    filter->GetSearchTerms(searchTerms);
    for (uint32_t i = 0; i < searchTerms.Length(); i++) {
      filter->GetTerm(i, &attrib, nullptr, nullptr, nullptr, arbitraryHeader);
      if (!arbitraryHeader.IsEmpty()) {
        if (m_arbitraryHeaders.IsEmpty())
          m_arbitraryHeaders.Assign(arbitraryHeader);
        else if (!FindInReadable(arbitraryHeader, m_arbitraryHeaders,
                                 nsCaseInsensitiveCStringComparator)) {
          m_arbitraryHeaders.Append(' ');
          m_arbitraryHeaders.Append(arbitraryHeader);
        }
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::GetArbitraryHeaders(nsACString& aResult) {
  ComputeArbitraryHeaders();
  aResult = m_arbitraryHeaders;
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterList::FlushLogIfNecessary() {
  // only flush the log if we are logging
  if (m_loggingEnabled && m_logStream) {
    nsresult rv = m_logStream->Flush();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

#define LOG_ENTRY_START_TAG "<p>\n"
#define LOG_ENTRY_START_TAG_LEN (strlen(LOG_ENTRY_START_TAG))
#define LOG_ENTRY_END_TAG "</p>\n"
#define LOG_ENTRY_END_TAG_LEN (strlen(LOG_ENTRY_END_TAG))

NS_IMETHODIMP nsMsgFilterList::LogFilterMessage(const nsAString& message,
                                                nsIMsgFilter* filter) {
  if (!m_loggingEnabled) {
    return NS_OK;
  }
  nsCOMPtr<nsIOutputStream> logStream;
  GetLogStream(getter_AddRefs(logStream));
  if (!logStream) {
    // Logging is on, but we failed to access the filter logfile.
    // For completeness, we'll return an error, but we don't expect anyone
    // to ever check it - logging failures shouldn't stop anything else.
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = bundleService->CreateBundle(
      "chrome://messenger/locale/filter.properties", getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString tempMessage(message);

  if (filter) {
    // If a filter was passed, prepend its name in the log message.
    nsString filterName;
    filter->GetFilterName(filterName);

    AutoTArray<nsString, 2> logFormatStrings = {filterName, tempMessage};
    nsString statusLogMessage;
    rv = bundle->FormatStringFromName("filterMessage", logFormatStrings,
                                      statusLogMessage);
    if (NS_SUCCEEDED(rv)) tempMessage.Assign(statusLogMessage);
  }

  // Prepare timestamp
  PRExplodedTime exploded;
  nsString dateValue;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &exploded);
  mozilla::intl::DateTimeFormat::StyleBag style;
  style.date = mozilla::Some(mozilla::intl::DateTimeFormat::Style::Short);
  style.time = mozilla::Some(mozilla::intl::DateTimeFormat::Style::Long);
  mozilla::intl::AppDateTimeFormat::Format(style, &exploded, dateValue);

  // HTML-escape the log for security reasons.
  // We don't want someone to send us a message with a subject with
  // HTML tags, especially <script>.
  nsCString escapedBuffer;
  nsAppendEscapedHTML(NS_ConvertUTF16toUTF8(tempMessage), escapedBuffer);

  // Print timestamp and the message.
  AutoTArray<nsString, 2> logFormatStrings = {dateValue};
  CopyUTF8toUTF16(escapedBuffer, *logFormatStrings.AppendElement());
  nsString filterLogMessage;
  rv = bundle->FormatStringFromName("filterLogLine", logFormatStrings,
                                    filterLogMessage);
  NS_ENSURE_SUCCESS(rv, rv);

  // Write message into log stream.
  uint32_t writeCount;
  rv = logStream->Write(LOG_ENTRY_START_TAG, LOG_ENTRY_START_TAG_LEN,
                        &writeCount);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(writeCount == LOG_ENTRY_START_TAG_LEN,
               "failed to write out start log tag");

  NS_ConvertUTF16toUTF8 buffer(filterLogMessage);
  uint32_t escapedBufferLen = buffer.Length();
  rv = logStream->Write(buffer.get(), escapedBufferLen, &writeCount);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(writeCount == escapedBufferLen, "failed to write out log hit");

  rv = logStream->Write(LOG_ENTRY_END_TAG, LOG_ENTRY_END_TAG_LEN, &writeCount);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(writeCount == LOG_ENTRY_END_TAG_LEN,
               "failed to write out end log tag");
  return NS_OK;
}
// ------------ End FilterList methods ------------------

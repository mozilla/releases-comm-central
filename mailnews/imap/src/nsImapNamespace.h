/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPNAMESPACE_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPNAMESPACE_H_

#include "nsImapCore.h"
#include "nsTArray.h"

class nsImapNamespace {
 public:
  nsImapNamespace(EIMAPNamespaceType type, const char* prefix, char delimiter,
                  bool from_prefs);

  ~nsImapNamespace();

  EIMAPNamespaceType GetType() { return m_namespaceType; }
  const char* GetPrefix() { return m_prefix; }
  char GetDelimiter() { return m_delimiter; }
  void SetDelimiter(char delimiter, bool delimiterFilledIn);
  bool GetIsDelimiterFilledIn() { return m_delimiterFilledIn; }
  bool GetIsNamespaceFromPrefs() { return m_fromPrefs; }

  // returns how well the box matches this namespace, the longest match wins:
  // the length of the prefix if the box lies within the namespace,
  // the length of the box if it is the root mailbox,
  // 0 if the prefix is empty, -1 otherwise
  int MailboxMatchesNamespace(const char* boxname);

  // returns true if the box is the mailbox at the root of this namespace,
  // named like the prefix without its trailing delimiter, if it has one
  bool IsRootMailbox(const char* boxname);

 protected:
  EIMAPNamespaceType m_namespaceType;
  char* m_prefix;
  char m_delimiter;
  bool m_fromPrefs;
  bool m_delimiterFilledIn;
};

// represents an array of namespaces for a given host
class nsImapNamespaceList {
 public:
  ~nsImapNamespaceList();

  static nsImapNamespaceList* CreatensImapNamespaceList();

  int UnserializeNamespaces(const char* str, char** prefixes, int len);

  void ClearNamespaces(bool deleteFromPrefsNamespaces,
                       bool deleteServerAdvertisedNamespaces,
                       bool reallyDelete);
  int GetNumberOfNamespaces();
  int GetNumberOfNamespaces(EIMAPNamespaceType);
  nsImapNamespace* GetNamespaceNumber(int nodeIndex);
  nsImapNamespace* GetNamespaceNumber(int nodeIndex, EIMAPNamespaceType);

  nsImapNamespace* GetDefaultNamespaceOfType(EIMAPNamespaceType type);
  int AddNewNamespace(nsImapNamespace* ns);
  nsImapNamespace* GetNamespaceForMailbox(const char* boxname);
  static nsImapNamespace* GetNamespaceForFolder(const char* hostname,
                                                const char* canonicalFolderName,
                                                char delimiter);
  static bool GetFolderIsNamespace(const char* hostname,
                                   const char* canonicalFolderName,
                                   char delimiter,
                                   nsImapNamespace* namespaceForFolder);
  static nsCString GetFolderOwnerNameFromPath(
      nsImapNamespace* namespaceForFolder, const char* canonicalFolderName);
  static void SuggestHierarchySeparatorForNamespace(
      nsImapNamespace* namespaceForFolder, char delimiterFromFolder);
  static nsCString GenerateFullFolderNameWithDefaultNamespace(
      const char* hostname, const char* canonicalFolderName, const char* owner,
      EIMAPNamespaceType nsType, nsImapNamespace** nsUsed);

 protected:
  nsImapNamespaceList();  // use CreatensImapNamespaceList to create one

  nsTArray<nsImapNamespace*> m_NamespaceList;
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPNAMESPACE_H_

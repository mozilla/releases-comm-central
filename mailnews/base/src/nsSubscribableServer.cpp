/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsSubscribableServer.h"
#include "nsIMsgIncomingServer.h"
#include "nsMsgI18N.h"
#include "nsMsgUtils.h"
#include "nsTHashMap.h"

/**
 * The basic structure for the tree of the implementation.
 *
 * Children are stored in insertion order, and indexed by name for lookups.
 * Each node owns its children and subsequent siblings.
 */
struct SubscribeTreeNode {
  nsCString name;
  nsCString path;
  bool isSubscribed;
  SubscribeTreeNode* nextSibling;
  SubscribeTreeNode* firstChild;
  SubscribeTreeNode* lastChild;
  SubscribeTreeNode* parent;
  nsTHashMap<nsCStringHashKey, SubscribeTreeNode*> childrenByName;
  bool isSubscribable;
};

nsSubscribableServer::nsSubscribableServer(void) {
  mDelimiter = '.';
  mShowFullName = true;
  mTreeRoot = nullptr;
  mStopped = false;
}

nsSubscribableServer::~nsSubscribableServer(void) {
  if (mTreeRoot) {
    FreeSubtree(mTreeRoot);
  }
}

NS_IMPL_ISUPPORTS(nsSubscribableServer, nsISubscribableServer)

NS_IMETHODIMP
nsSubscribableServer::SetIncomingServer(nsIMsgIncomingServer* aServer) {
  if (!aServer) {
    mIncomingServerUri.AssignLiteral("");
    return NS_OK;
  }

  // We intentionally do not store a pointer to the aServer here
  // as it would create reference loops, because nsIImapIncomingServer
  // and nsINntpIncomingServer keep a reference to an internal
  // nsISubscribableServer object.
  // We only need the URI of the server anyway.
  return aServer->GetServerURI(mIncomingServerUri);
}

NS_IMETHODIMP
nsSubscribableServer::GetDelimiter(char* aDelimiter) {
  NS_ENSURE_ARG_POINTER(aDelimiter);
  *aDelimiter = mDelimiter;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetDelimiter(char aDelimiter) {
  mDelimiter = aDelimiter;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetAsSubscribed(const nsACString& path) {
  nsresult rv = NS_OK;

  SubscribeTreeNode* node = nullptr;
  rv = FindAndCreateNode(path, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;
  node->isSubscribable = true;
  node->isSubscribed = true;

  return rv;
}

NS_IMETHODIMP
nsSubscribableServer::AddTo(const nsACString& aName, bool aAddAsSubscribed,
                            bool aSubscribable, bool aChangeIfExists) {
  nsresult rv = NS_OK;

  if (mStopped) {
    return NS_ERROR_FAILURE;
  }

  SubscribeTreeNode* node = nullptr;

  // todo, shouldn't we pass in aAddAsSubscribed, for the
  // default value if we create it?
  rv = FindAndCreateNode(aName, &node);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  if (aChangeIfExists) {
    node->isSubscribed = aAddAsSubscribed;
  }

  node->isSubscribable = aSubscribable;

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetState(const nsACString& aPath, bool aState,
                               bool* aStateChanged) {
  nsresult rv = NS_OK;
  NS_ASSERTION(!aPath.IsEmpty() && aStateChanged, "no path or stateChanged");
  if (aPath.IsEmpty() || !aStateChanged) return NS_ERROR_NULL_POINTER;

  NS_ASSERTION(mozilla::IsUtf8(aPath), "aPath is not in UTF-8");

  *aStateChanged = false;

  SubscribeTreeNode* node = nullptr;
  rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  NS_ASSERTION(node->isSubscribable, "fix this");
  if (!node->isSubscribable) {
    return NS_OK;
  }

  if (node->isSubscribed == aState) {
    return NS_OK;
  } else {
    node->isSubscribed = aState;
    *aStateChanged = true;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetSubscribeListener(nsISubscribeListener* aListener) {
  mSubscribeListener = aListener;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetSubscribeListener(nsISubscribeListener** aListener) {
  NS_ENSURE_ARG_POINTER(aListener);
  NS_IF_ADDREF(*aListener = mSubscribeListener);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SubscribeCleanup() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::StartPopulating(nsIMsgWindow* aMsgWindow,
                                      bool aForceToServer,
                                      bool aGetOnlyNew /*ignored*/) {
  mStopped = false;

  if (mTreeRoot) {
    FreeSubtree(mTreeRoot);
    mTreeRoot = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::StopPopulating(nsIMsgWindow* aMsgWindow) {
  mStopped = true;

  if (mSubscribeListener) mSubscribeListener->OnDonePopulating();

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::UpdateSubscribed() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::Subscribe(const nsACString& aName) {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::Unsubscribe(const nsACString& aName) {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::SetShowFullName(bool showFullName) {
  mShowFullName = showFullName;
  return NS_OK;
}

void nsSubscribableServer::FreeSubtree(SubscribeTreeNode* node) {
  // NOTE: this doesn't cleanly detach each node, but that's not an issue
  // here. This is a nuking, not a surgical removal.

  // Iterative, since a server can return a huge number of siblings and
  // recursing along them would exhaust the stack.
  AutoTArray<SubscribeTreeNode*, 32> pending;
  pending.AppendElement(node);
  while (!pending.IsEmpty()) {
    SubscribeTreeNode* current = pending.PopLastElement();
    if (current->firstChild) {
      pending.AppendElement(current->firstChild);
    }
    if (current->nextSibling) {
      pending.AppendElement(current->nextSibling);
    }
    delete current;
  }
}

SubscribeTreeNode* nsSubscribableServer::CreateNode(SubscribeTreeNode* parent,
                                                    nsACString const& name,
                                                    nsACString const& path) {
  SubscribeTreeNode* node = new SubscribeTreeNode();

  node->name.Assign(name);
  node->path.Assign(path);
  node->parent = parent;
  node->nextSibling = nullptr;
  node->firstChild = nullptr;
  node->lastChild = nullptr;
  node->isSubscribed = false;
  node->isSubscribable = false;
  return node;
}

nsresult nsSubscribableServer::AddChildNode(SubscribeTreeNode* parent,
                                            nsACString const& name,
                                            const nsACString& path,
                                            SubscribeTreeNode** child) {
  NS_ASSERTION(parent && child && !name.IsEmpty() && !path.IsEmpty(),
               "parent, child or name is null");
  if (!parent || !child || name.IsEmpty() || path.IsEmpty())
    return NS_ERROR_NULL_POINTER;

  *child = parent->childrenByName.LookupOrInsertWith(name, [&] {
    SubscribeTreeNode* node = CreateNode(parent, name, path);
    if (parent->lastChild) {
      parent->lastChild->nextSibling = node;
    } else {
      parent->firstChild = node;
    }
    parent->lastChild = node;
    return node;
  });
  return NS_OK;
}

nsresult nsSubscribableServer::FindAndCreateNode(const nsACString& aPath,
                                                 SubscribeTreeNode** aResult) {
  nsresult rv = NS_OK;
  NS_ASSERTION(aResult, "no result");
  NS_ENSURE_ARG_POINTER(aResult);

  if (!mTreeRoot) {
    // the root has no parent, and its name is server uri
    mTreeRoot = CreateNode(nullptr, mIncomingServerUri, EmptyCString());
  }

  if (aPath.IsEmpty()) {
    *aResult = mTreeRoot;
    return NS_OK;
  }

  *aResult = nullptr;

  SubscribeTreeNode* parent = mTreeRoot;
  SubscribeTreeNode* child = nullptr;

  uint32_t tokenStart = 0;
  // Special case paths that start with the hierarchy delimiter.
  // We want to include that delimiter in the first token name.
  // So start from position 1.
  int32_t tokenEnd = aPath.FindChar(mDelimiter, tokenStart + 1);
  while (true) {
    if (tokenEnd == kNotFound) {
      if (tokenStart >= aPath.Length()) break;
      tokenEnd = aPath.Length();
    }
    nsCString token(Substring(aPath, tokenStart, tokenEnd - tokenStart));
    rv = AddChildNode(parent, token, Substring(aPath, 0, tokenEnd), &child);
    if (NS_FAILED(rv)) return rv;
    tokenStart = tokenEnd + 1;
    tokenEnd = aPath.FindChar(mDelimiter, tokenStart);
    parent = child;
  }

  // the last child we add is the result
  *aResult = child;
  return rv;
}

NS_IMETHODIMP
nsSubscribableServer::HasChildren(const nsACString& aPath, bool* aHasChildren) {
  NS_ASSERTION(aHasChildren, "no hasChildren");
  NS_ENSURE_ARG_POINTER(aHasChildren);

  *aHasChildren = false;

  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aHasChildren = (node->firstChild != nullptr);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSubscribed(const nsACString& aPath,
                                   bool* aIsSubscribed) {
  NS_ENSURE_ARG_POINTER(aIsSubscribed);

  *aIsSubscribed = false;

  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aIsSubscribed = node->isSubscribed;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSubscribable(const nsACString& aPath,
                                     bool* aIsSubscribable) {
  NS_ENSURE_ARG_POINTER(aIsSubscribable);

  *aIsSubscribable = false;

  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aIsSubscribable = node->isSubscribable;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetLeafName(const nsACString& aPath,
                                  nsAString& aLeafName) {
  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  // mShowFullName is true for NNTP, false for IMAP.
  // For news, the path is escaped UTF-8, so unescape it to show the full path.
  // For imap, show only the node name, which may be encoded as modified UTF-7.
  if (mShowFullName) {
    nsAutoCString unescapedName;
    MsgUnescapeString(
        aPath,
        nsINetUtil::ESCAPE_URL_FILE_BASENAME | nsINetUtil::ESCAPE_URL_FORCED,
        unescapedName);
    CopyUTF8toUTF16(unescapedName, aLeafName);
    return NS_OK;
  }

  return CopyFolderNameToUTF16(node->name, aLeafName);
}

NS_IMETHODIMP
nsSubscribableServer::GetFirstChildURI(const nsACString& aPath,
                                       nsACString& aResult) {
  aResult.Truncate();

  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  // no children
  if (!node->firstChild) return NS_ERROR_FAILURE;

  SubscribeTreeNode* first = node->firstChild;
  for (SubscribeTreeNode* current = first->nextSibling; current;
       current = current->nextSibling) {
    if (current->name < first->name) {
      first = current;
    }
  }
  aResult.Assign(first->path);

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetChildURIs(const nsACString& aPath,
                                   nsTArray<nsCString>& aResult) {
  aResult.Clear();
  SubscribeTreeNode* node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  NS_ASSERTION(mTreeRoot, "no tree root!");
  if (!mTreeRoot) return NS_ERROR_UNEXPECTED;

  aResult.SetCapacity(node->childrenByName.Count());
  for (SubscribeTreeNode* current = node->firstChild; current;
       current = current->nextSibling) {
    NS_ASSERTION(!current->name.IsEmpty(), "no name");
    if (current->name.IsEmpty()) {
      aResult.Clear();
      return NS_ERROR_FAILURE;
    }
    aResult.AppendElement(current->path);
  }
  // Siblings share the path up to their name, so sorting the paths sorts them
  // by name.
  aResult.Sort();

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::CommitSubscribeChanges() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

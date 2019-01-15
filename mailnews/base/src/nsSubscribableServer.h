/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsSubscribableServer_h__
#define nsSubscribableServer_h__

#include "nsCOMPtr.h"
#include "nsString.h"
#include "nsIMsgIncomingServer.h"
#include "mozilla/dom/XULTreeElement.h"
#include "nsITreeSelection.h"
#include "nsITreeView.h"
#include "nsISubscribableServer.h"
#include "nsTArray.h"

/**
 * The basic structure for the tree of the implementation.
 *
 * These elements are stored in reverse alphabetical order.
 */
typedef struct _subscribeTreeNode {
  char *name;
  nsCString path;
  bool isSubscribed;
  struct _subscribeTreeNode *prevSibling;
  struct _subscribeTreeNode *nextSibling;
  struct _subscribeTreeNode *firstChild;
  struct _subscribeTreeNode *lastChild;
  struct _subscribeTreeNode *parent;
  struct _subscribeTreeNode *cachedChild;
#ifdef HAVE_SUBSCRIBE_DESCRIPTION
  char16_t *description;
#endif
#ifdef HAVE_SUBSCRIBE_MESSAGES
  uint32_t messages;
#endif
  bool isSubscribable;
  bool isOpen;
} SubscribeTreeNode;


class nsSubscribableServer : public nsISubscribableServer,
                             public nsITreeView
{
public:
  nsSubscribableServer();

  nsresult Init();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSISUBSCRIBABLESERVER
  NS_DECL_NSITREEVIEW

private:
  virtual ~nsSubscribableServer();

  nsresult ConvertNameToUnichar(const char *inStr, char16_t **outStr);
  nsCOMPtr <nsISubscribeListener> mSubscribeListener;
  nsCString mIncomingServerUri;
  char mDelimiter;
  bool mShowFullName;
  bool mStopped;
  nsCString mServerType;

  SubscribeTreeNode *mTreeRoot;          // root of the folder tree while items are discovered on the server
  nsTArray<SubscribeTreeNode*> mRowMap;  // array of nodes representing the rows for the tree element
  nsCOMPtr<nsITreeSelection> mSelection;
  RefPtr<mozilla::dom::XULTreeElement> mTree;
  nsresult FreeSubtree(SubscribeTreeNode *node);
  nsresult FreeRows();
  nsresult CreateNode(SubscribeTreeNode *parent, const char *name, const nsACString &aPath, SubscribeTreeNode **result);
  nsresult AddChildNode(SubscribeTreeNode *parent, const char *name, const nsACString &aPath, SubscribeTreeNode **child);
  nsresult FindAndCreateNode(const nsACString &aPath, SubscribeTreeNode **aResult);

  int32_t GetRow(SubscribeTreeNode *node, bool *open);
  int32_t AddSubtree(SubscribeTreeNode *node, int32_t index);
};

#endif // nsSubscribableServer_h__

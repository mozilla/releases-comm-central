/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <Quartz/Quartz.h>

#include "nsMacQuickLook.h"
#include "nsObjCExceptions.h"
#include "nsCocoaUtils.h"

// Wraps a single preview item for QLPreviewPanel.
@interface MOZQuickLookItem : NSObject <QLPreviewItem>
@property(readonly, nonatomic) NSURL* previewItemURL;
@property(readonly, nonatomic) NSString* previewItemTitle;
- (instancetype)initWithURL:(NSURL*)url title:(NSString*)title;
@end

@implementation MOZQuickLookItem
- (instancetype)initWithURL:(NSURL*)url title:(NSString*)title {
  self = [super init];
  if (self) {
    _previewItemURL = [url retain];
    _previewItemTitle = [title copy];
  }
  return self;
}

- (void)dealloc {
  [_previewItemURL release];
  [_previewItemTitle release];
  [super dealloc];
}
@end

// Data source and delegate for QLPreviewPanel.
@interface MOZQuickLookDelegate
    : NSObject <QLPreviewPanelDataSource, QLPreviewPanelDelegate>
@property(nonatomic, strong) NSMutableArray<MOZQuickLookItem*>* items;
@end

@implementation MOZQuickLookDelegate

- (NSInteger)numberOfPreviewItemsInPreviewPanel:(QLPreviewPanel*)panel {
  return self.items.count;
}

- (id<QLPreviewItem>)previewPanel:(QLPreviewPanel*)panel
               previewItemAtIndex:(NSInteger)index {
  if (index < 0 || (NSUInteger)index >= self.items.count) {
    return nil;
  }
  return self.items[index];
}

@end

static MOZQuickLookDelegate* sDelegate = nil;

NS_IMPL_ISUPPORTS(nsMacQuickLook, nsIMacQuickLook)

nsMacQuickLook::~nsMacQuickLook() {
  NS_OBJC_BEGIN_TRY_IGNORE_BLOCK;
  if (sDelegate) {
    QLPreviewPanel* panel = [QLPreviewPanel sharedPreviewPanel];
    if ([panel isVisible]) {
      [panel orderOut:nil];
    }
    panel.dataSource = nil;
    panel.delegate = nil;
    [sDelegate release];
    sDelegate = nil;
  }
  NS_OBJC_END_TRY_IGNORE_BLOCK;
}

NS_IMETHODIMP
nsMacQuickLook::Show(const nsTArray<nsString>& aFilePaths,
                     const nsTArray<nsString>& aTitles, uint32_t aIndex) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  if (aFilePaths.IsEmpty()) {
    return NS_ERROR_INVALID_ARG;
  }
  if (aFilePaths.Length() != aTitles.Length()) {
    return NS_ERROR_INVALID_ARG;
  }

  mFilePaths = aFilePaths.Clone();
  mTitles = aTitles.Clone();

  if (!sDelegate) {
    sDelegate = [[MOZQuickLookDelegate alloc] init];
  }

  NSMutableArray* items =
      [NSMutableArray arrayWithCapacity:aFilePaths.Length()];
  for (uint32_t i = 0; i < aFilePaths.Length(); i++) {
    NSString* path = nsCocoaUtils::ToNSString(aFilePaths[i]);
    NSString* title = nsCocoaUtils::ToNSString(aTitles[i]);
    NSURL* url = [NSURL fileURLWithPath:path];
    MOZQuickLookItem* item = [[MOZQuickLookItem alloc] initWithURL:url
                                                             title:title];
    [items addObject:item];
    [item release];
  }
  sDelegate.items = items;

  QLPreviewPanel* panel = [QLPreviewPanel sharedPreviewPanel];
  panel.dataSource = sDelegate;
  panel.delegate = sDelegate;
  [panel reloadData];
  if (aIndex < aFilePaths.Length()) {
    [panel setCurrentPreviewItemIndex:aIndex];
  }
  [panel makeKeyAndOrderFront:nil];

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMacQuickLook::Close() {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  QLPreviewPanel* panel = [QLPreviewPanel sharedPreviewPanel];
  if ([panel isVisible]) {
    [panel orderOut:nil];
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMacQuickLook::GetIsOpen(bool* aResult) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  *aResult = [[QLPreviewPanel sharedPreviewPanel] isVisible];
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMacQuickLook::NavigateToIndex(uint32_t aIndex) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  QLPreviewPanel* panel = [QLPreviewPanel sharedPreviewPanel];
  if ([panel isVisible]) {
    [panel setCurrentPreviewItemIndex:aIndex];
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

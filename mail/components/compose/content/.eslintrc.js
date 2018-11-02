"use strict";

module.exports = {
  globals: {
    // editor/ui/composer/content/ComposerCommands.js
    doStatefulCommand: true,
    SaveDocument: true,
    // editor/ui/composer/content/editor.js
    EditorCleanup: true,
    EditorSetFontSize: true,
    EditorSharedStartup: true,
    gChromeState: true,
    gDefaultBackgroundColor: true,
    gDefaultTextColor: true,
    GetBodyElement: true,
    initLocalFontFaceMenu: true,
    onBackgroundColorChange: true,
    onFontColorChange: true,
    // editor/ui/composer/content/editorUtilities.js:
    GetCurrentCommandManager: true,
    GetCurrentEditor: true,
    GetCurrentEditorElement: true,

    // mail/base/content/contentAreaClick.js
    openLinkExternally: true,
    // mail/base/content/mailCore.js
    CreateAttachmentTransferData: true,
    MailToolboxCustomizeDone: true,
    openOptionsDialog: true,
    // mail/base/content/mail-compacttheme.js
    CompactTheme: true,
    // mail/base/content/nsDragAndDrop.js
    FlavourSet: true,
    nsDragAndDrop: true,
    // mail/base/content/toolbarIconColor.js
    ToolbarIconColor: true,
    // mail/base/content/utilityOverlay.js
    goToggleToolbar: true,
    openContentTab: true,

    // mailnews/addrbook/content/abDragDrop.js
    DragAddressOverTargetControl: true,
    // mailnews/base/prefs/content/accountUtils.js
    MsgAccountManager: true,
    verifyAccounts: true,

    // toolkit/components/printing/content/printUtils.js
    PrintUtils: true,
    // toolkit/content/globalOverlay.js
    goDoCommand: true,
    goSetCommandEnabled: true,
    goUpdateCommand: true,
    // toolkit/content/viewZoomOverlay.js
    ZoomManager: true,
  },
};

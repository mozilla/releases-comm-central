# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

  <tooltip id="imTooltip" type="im"/>

  <menupopup id="buddyListContextMenu"
             onpopupshowing="if (event.target != this) return true; gBuddyListContextMenu = new buddyListContextMenu(this); return gBuddyListContextMenu.shouldDisplay;"
             onpopuphiding="if (event.target == this) { gBuddyListContextMenu = null; }">
    <menuitem id="context-openconversation"
              label="&openConversationCmd.label;"
              accesskey="&openConversationCmd.accesskey;"
              oncommand="gBuddyListContextMenu.openConversation();"/>
    <menuitem id="context-close-conversation"
              label="&closeConversationCmd.label;"
              accesskey="&closeConversationCmd.accesskey;"
              oncommand="gBuddyListContextMenu.closeConversation();"/>
    <menuseparator id="context-edit-buddy-separator"/>
    <menuitem id="context-alias"
              label="&aliasCmd.label;"
              accesskey="&aliasCmd.accesskey;"
              oncommand="gBuddyListContextMenu.alias();"/>
    <menuitem id="context-delete"
              label="&deleteCmd.label;"
              accesskey="&deleteCmd.accesskey;"
              oncommand="gBuddyListContextMenu.delete();"/>
  </menupopup>

  <menupopup id="chatConversationContextMenu"
             onpopupshowing="if (event.target != this) return true; gChatContextMenu = new imContextMenu(this); return gChatContextMenu.shouldDisplay;"
             onpopuphiding="if (event.target == this &amp;&amp; gChatContextMenu) { gChatContextMenu.cleanup(); gChatContextMenu = null; }">
    <menuitem id="context-openlink"
              label="&openLinkCmd.label;"
              accesskey="&openLinkCmd.accesskey;"
              oncommand="gChatContextMenu.openLink();"/>
    <menuitem id="context-copyemail"
              label="&copyEmailCmd.label;"
              accesskey="&copyEmailCmd.accesskey;"
              oncommand="gChatContextMenu.copyEmail();"/>
    <menuitem id="context-copylink"
              label="&copyLinkCmd.label;"
              accesskey="&copyLinkCmd.accesskey;"
              oncommand="goDoCommand('cmd_copyLink');"/>
    <menuseparator id="context-sep-copylink"/>

    <menuitem id="context-copy"
              label="&copyCmd.label;"
              accesskey="&copyCmd.accesskey;"
              command="cmd_copy"/>
    <menuitem id="context-selectall"
              label="&selectAllCmd.label;"
              accesskey="&selectAllCmd.accesskey;"
              command="cmd_selectAll"/>
    <menuseparator id="context-sep-messageactions"/>
  </menupopup>

  <menupopup id="chat-toolbar-context-menu">
    <menuitem id="CustomizeChatToolbar"
              oncommand="CustomizeMailToolbar('chat-view-toolbox', 'CustomizeChatToolbar')"
              label="&customizeToolbar.label;"
              accesskey="&customizeToolbar.accesskey;"/>
  </menupopup>

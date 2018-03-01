      <!-- Mac window menu -->
      <menu id="windowMenu"
            label="&windowMenu.label;"
            onpopupshowing="macWindowMenuDidShow();"
            onpopuphidden="macWindowMenuDidHide();">
        <menupopup id="windowPopup">
          <menuitem id="minimizeWindow"
                    label="&minimizeWindow.label;"
                    oncommand="window.minimize();"
                    key="key_minimizeWindow"/>
          <menuitem id="zoomWindow"
                    label="&zoomWindow.label;"
                    oncommand="zoomWindow();"/>
          <!-- decomment when "BringAllToFront" is implemented
            <menuseparator/>
            <menuitem label="&bringAllToFront.label;" disabled="true"/> -->
          <menuseparator id="mac-window-list"/>
          <menuitem accesskey="&messengerCmd.accesskey;"
                    label="&messengerCmd.label;"  key="key_mail"
                    oncommand="toMessengerWindow();" id="tasksMenuMail"/>
          <menuitem id="tasksMenuAddressBook"
                    label="&addressBookCmd.label;"
                    accesskey="&addressBookCmd.accesskey;"
                    key="key_addressbook"
                    oncommand="toAddressBook();"/>
          <menuseparator id="sep-window-list"/>
        </menupopup>
      </menu>

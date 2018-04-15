# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

<panel id="editContactPanel"
        type="arrow"
        orient="vertical"
        ignorekeys="true"
        hidden="true"
#if 0
        # consumeoutsideclicks=true is here so clicking onto the star icon next
        # to an address (onClickEmailStar()) for a second time will close the
        # panel due to the outside click and not trigger opening the panel
        # again since the panel itself consumes the click.
        # That's the theory. In practice we haven't seen any platform where
        # this would be necessary, so we leave it as a reference to the
        # quirky old past where setConsumeRollupEvent(PopupBoxObject.ROLLUP_CONSUME)
        # was used.
        consumeoutsideclicks="true"
#endif
        aria-labelledby="editContactPanelTitle"
        onpopuphidden="editContactInlineUI.onPopupHidden(event);"
        onpopupshown="editContactInlineUI.onPopupShown(event);"
        onkeypress="editContactInlineUI.onKeyPress(event, true);">
  <hbox flex="1" align="center">
    <image id="editContactPanelIcon"/>
    <label id="editContactPanelTitle" flex="1"/>
    <button id="editContactPanelDeleteContactButton"
            label="&editContactPanelDeleteContact.label;"
            accesskey="&editContactPanelDeleteContact.accesskey;"
            oncommand="editContactInlineUI.deleteContact();"
            onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
  </hbox>

  <vbox id="editContactContent">
    <grid id="editContactGrid" flex="1">
      <columns>
        <column/>
        <column flex="1"/>
      </columns>
      <rows>
        <row align="center" id="editContactNameRow">
          <label value="&editContactName.label;"
                  class="editContactPanel_rowLabel"
                  accesskey="&editContactName.accesskey;"
                  control="editContactName"/>
          <textbox id="editContactName" class="editContactTextbox"
                    onkeypress="editContactInlineUI.onKeyPress(event, true);"/>
        </row>
        <row align="center" id="editContactEmailRow">
          <label value="&editContactEmail.label;"
                  class="editContactPanel_rowLabel"
                  accesskey="&editContactEmail.accesskey;"
                  control="editContactEmail"/>
          <textbox id="editContactEmail" readonly="true"
                    class="editContactTextbox"
                    onkeypress="editContactInlineUI.onKeyPress(event, true);"/>
        </row>
        <row align="center" id="editContactABRow">
          <label id="editContactAddressBook"
                  class="editContactPanel_rowLabel"
                  value="&editContactAddressBook.label;"
                  accesskey="&editContactAddressBook.accesskey;"
                  control="editContactAddressBookList"/>
          <menulist id="editContactAddressBookList" flex="1">
            <menupopup id="editContactAddressBookList-menupopup"
                        class="addrbooksPopup"/>
          </menulist>
        </row>
        <row>
          <hbox/>
          <description id="contactMoveDisabledText"
                        collapsed="true">&contactMoveDisabledWarning.description;</description>
        </row>
      </rows>
    </grid>
  </vbox>

  <vbox>
    <hbox flex="1" id="editContactPanelBottomButtons">
      <button id="editContactPanelEditDetailsButton"
              oncommand="editContactInlineUI.editDetails();"
              onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
      <spacer flex="1"/>
#ifndef XP_UNIX
      <button id="editContactPanelDoneButton"
              label="&editContactPanelDone.label;"
              accesskey="&editContactPanelDone.accesskey;" default="true"
              oncommand="editContactInlineUI.saveChanges();"
              onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
      <button id="editContactPanelCancelButton"
              label="&editContactPanelCancel.label;"
              accesskey="&editContactPanelCancel.accesskey;"
              oncommand="editContactInlineUI.panel.hidePopup();"
              onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
#else
      <button id="editContactPanelCancelButton"
              label="&editContactPanelCancel.label;"
              accesskey="&editContactPanelCancel.accesskey;"
              oncommand="editContactInlineUI.panel.hidePopup();"
              onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
      <button id="editContactPanelDoneButton"
              label="&editContactPanelDone.label;"
              accesskey="&editContactPanelDone.accesskey;" default="true"
              oncommand="editContactInlineUI.saveChanges();"
              onkeypress="editContactInlineUI.onKeyPress(event, false);"/>
#endif
    </hbox>
  </vbox>
</panel>

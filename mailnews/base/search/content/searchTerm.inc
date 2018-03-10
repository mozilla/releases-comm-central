# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

          <radiogroup id="booleanAndGroup" orient="horizontal" value="and"
                      oncommand="booleanChanged(event);">
            <radio value="and" label="&matchAll.label;"
                   accesskey="&matchAll.accesskey;"/>
            <radio value="or" label="&matchAny.label;"
                   accesskey="&matchAny.accesskey;"/>
            <radio value="matchAll" id="matchAllItem" label="&matchAllMsgs.label;"
                   accesskey="&matchAllMsgs.accesskey;"/>
          </radiogroup>

          <hbox flex="1">
            <hbox id="searchterms"/>
            <listbox flex="1" id="searchTermList" rows="4" minheight="35%">
              <listcols>
                <listcol flex="&searchTermListAttributesFlexValue;"/>
                <listcol flex="&searchTermListOperatorsFlexValue;"/>
                <listcol flex="&searchTermListValueFlexValue;"/>
                <listcol class="filler"/>
              </listcols>
            </listbox>

          </hbox>
        </vbox>

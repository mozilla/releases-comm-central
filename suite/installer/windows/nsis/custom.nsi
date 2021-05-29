# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

!macro checkSuiteComponents
  ; If no extensions are available skip the components page
  ${Unless} ${FileExists} "$EXEDIR\optional\extensions\debugQA@mozilla.org.xpi"
  ${AndUnless} ${FileExists} "$EXEDIR\optional\extensions\{f13b157f-b174-47e7-a34d-4815ddfdfeb8}.xpi"
    Abort
  ${EndUnless}
!macroend

!macro createSuiteComponentsIni
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Type   "label"
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Text   "$(OPTIONAL_COMPONENTS_LABEL)"
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Left   "0"
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Right  "-1"
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Top    "0"
  WriteINIStr "$PLUGINSDIR\components.ini" "Field 1" Bottom "15"

  StrCpy $R1 2
  ; Top of checkbox
  StrCpy $R2 15
  ; Bottom of checkbox
  StrCpy $R3 25
  ; Seperation between titles/text
  StrCpy $R4 25

  ${If} ${FileExists} "$EXEDIR\optional\extensions\debugQA@mozilla.org.xpi"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Type   "checkbox"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Text   "$(DEBUGQA_TITLE)"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Left   "15"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Right  "-1"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Top    "$R2"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Bottom "$R3"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" State  "1"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Flags  "GROUP"
    ${GetSize} "$EXEDIR\optional\extensions\debugQA@mozilla.org.xpi" "/S=0K" $0 $8 $9
    SectionSetSize ${DEBUG_IDX} $0
    IntOp $R1 $R1 + 1
    IntOp $R2 $R2 + $R4
    IntOp $R3 $R3 + $R4
  ${Else}
    ; Hide debugQA in the components page if it isn't available.
    SectionSetText ${DEBUG_IDX} ""
  ${EndIf}

  ; Set new values for the top and bottom of labels
  ; Top of label box
  StrCpy $R2 27
  ; Bottom of label box
  StrCpy $R3 47

  ${If} ${FileExists} "$EXEDIR\optional\extensions\debugQA@mozilla.org.xpi"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Type   "label"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Text   "$(DEBUGQA_TEXT)"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Left   "30"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Right  "-1"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Top    "$R2"
    WriteINIStr "$PLUGINSDIR\components.ini" "Field $R1" Bottom "$R3"
    IntOp $R1 $R1 + 1
    IntOp $R2 $R2 + $R4
    IntOp $R3 $R3 + $R4
  ${EndIf}

  WriteINIStr "$PLUGINSDIR\components.ini" "Settings" NumFields "$R1"

!macroend

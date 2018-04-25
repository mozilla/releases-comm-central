# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# NSIS defines for nightly builds.
# The release build branding.nsi is located in other-license/branding/thunderbird/

# BrandFullNameInternal is used for some registry and file system values
# instead of BrandFullName and typically should not be modified.
!define BrandFullNameInternal "Daily"
!define BrandFullName         "Thunderbird Daily"
!define CompanyName           "mozilla.org"
!define URLInfoAbout          "https://www.mozilla.org/"
!define URLUpdateInfo         "https://www.thunderbird.net/"
!define URLSystemRequirements "https://www.thunderbird.net/thunderbird/system-requirements/"
!define SurveyURL             "https://live.thunderbird.net/survey/uninstall/?locale=${AB_CD}&version=${AppVersion}"

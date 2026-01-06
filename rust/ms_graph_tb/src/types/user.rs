/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;

use crate::types::directory_object::*;
use crate::Error;

#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum UserSelection {
    AboutMe,
    AccountEnabled,
    AgeGroup,
    Birthday,
    BusinessPhones,
    City,
    CompanyName,
    ConsentProvidedForMinor,
    Country,
    CreatedDateTime,
    CreationType,
    Department,
    DeviceEnrollmentLimit,
    DirectoryObject(DirectoryObjectSelection),
    DisplayName,
    EmployeeHireDate,
    EmployeeId,
    EmployeeLeaveDateTime,
    EmployeeType,
    ExternalUserState,
    ExternalUserStateChangeDateTime,
    FaxNumber,
    GivenName,
    HireDate,
    ImAddresses,
    Interests,
    IsManagementRestricted,
    IsResourceAccount,
    JobTitle,
    LastPasswordChangeDateTime,
    LegalAgeGroupClassification,
    Mail,
    MailNickname,
    MailboxSettings,
    MobilePhone,
    MySite,
    OfficeLocation,
    OnPremisesDistinguishedName,
    OnPremisesDomainName,
    OnPremisesImmutableId,
    OnPremisesLastSyncDateTime,
    OnPremisesSamAccountName,
    OnPremisesSecurityIdentifier,
    OnPremisesSyncEnabled,
    OnPremisesUserPrincipalName,
    OtherMails,
    PasswordPolicies,
    PastProjects,
    PostalCode,
    PreferredDataLocation,
    PreferredLanguage,
    PreferredName,
    ProxyAddresses,
    Responsibilities,
    Schools,
    SecurityIdentifier,
    ShowInAddressList,
    SignInSessionsValidFromDateTime,
    Skills,
    State,
    StreetAddress,
    Surname,
    UsageLocation,
    UserPrincipalName,
    UserType,
}

/// Represents a Microsoft Entra user account.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct User<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}

impl<'a> User<'a> {
    /// Internal constructor.
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        User {
            properties: Cow::Borrowed(properties),
        }
    }

    /// A freeform text entry field for the user to describe themselves. Returned only on $select.
    pub fn about_me(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("aboutMe").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The telephone numbers for the user. NOTE: Although it's a string collection, only one number can be set for this property. Read-only for users synced from the on-premises directory. Returned by default. Supports $filter (eq, not, ge, le, startsWith).
    pub fn business_phones(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .get("businessPhones")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }

    /// Accessor to inhereted properties from `DirectoryObject`.
    pub fn directory_object(&'a self) -> DirectoryObject<'a> {
        DirectoryObject {
            properties: Cow::Borrowed(&*self.properties),
        }
    }

    /// The name displayed in the address book for the user. This value is usually the combination of the user's first name, middle initial, and family name. This property is required when a user is created and it can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports $filter (eq, ne, not , ge, le, in, startsWith, and eq on null values), $orderby, and $search.
    pub fn display_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("displayName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The given name (first name) of the user. Maximum length is 64 characters. Returned by default. Supports $filter (eq, ne, not , ge, le, in, startsWith, and eq on null values).
    pub fn given_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("givenName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The user's job title. Maximum length is 128 characters. Returned by default. Supports $filter (eq, ne, not , ge, le, in, startsWith, and eq on null values).
    pub fn job_title(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("jobTitle").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The SMTP address for the user, for example, jeff@contoso.com. Changes to this property update the user's proxyAddresses collection to include the value as an SMTP address. This property can't contain accent characters.  NOTE: We don't recommend updating this property for Azure AD B2C user profiles. Use the otherMails property instead. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, endsWith, and eq on null values).
    pub fn mail(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mail").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The primary cellular telephone number for the user. Read-only for users synced from the on-premises directory. Maximum length is 64 characters. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, and eq on null values) and $search.
    pub fn mobile_phone(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mobilePhone").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The office location in the user's place of business. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, and eq on null values).
    pub fn office_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("officeLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The preferred language for the user. The preferred language format is based on RFC 4646. The name is a combination of an ISO 639 two-letter lowercase culture code associated with the language, and an ISO 3166 two-letter uppercase subculture code associated with the country or region. Example: 'en-US', or 'es-ES'. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, and eq on null values)
    pub fn preferred_language(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("preferredLanguage")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The user's surname (family name or last name). Maximum length is 64 characters. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, and eq on null values).
    pub fn surname(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("surname").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// The user principal name (UPN) of the user. The UPN is an Internet-style sign-in name for the user based on the Internet standard RFC 822. By convention, this value should map to the user's email name. The general format is alias@domain, where the domain must be present in the tenant's collection of verified domains. This property is required when a user is created. The verified domains for the tenant can be accessed from the verifiedDomains property of organization.NOTE: This property can't contain accent characters. Only the following characters are allowed A - Z, a - z, 0 - 9, ' . - _ ! # ^ ~. For the complete list of allowed characters, see username policies. Returned by default. Supports $filter (eq, ne, not, ge, le, in, startsWith, endsWith) and $orderby.
    pub fn user_principal_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("userPrincipalName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to User.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::directory_object::{DirectoryObject, DirectoryObjectSelection};
use crate::types::mailbox_settings::MailboxSettings;
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use strum::Display;
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
#[doc = "Represents a Microsoft Entra user account."]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct User<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for User<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> User<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "A freeform text entry field for the user to describe themselves.\n\n Returned only on `$select`."]
    pub fn about_me(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("aboutMe").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`about_me`](Self::about_me).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_about_me(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("aboutMe".to_string(), val.into());
        self
    }
    #[doc = "true if the account is enabled; otherwise, false.\n\n This property is required when a user is created. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn account_enabled(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("accountEnabled")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`account_enabled`](Self::account_enabled).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_account_enabled(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("accountEnabled".to_string(), val.into());
        self
    }
    #[doc = "Sets the age group of the user.\n\n Allowed values: `null`, `Minor`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn age_group(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("ageGroup").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`age_group`](Self::age_group).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_age_group(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("ageGroup".to_string(), val.into());
        self
    }
    #[doc = "The birthday of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub fn birthday(&self) -> Result<&str, Error> {
        let val = self.properties.0.get("birthday").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))
    }
    #[doc = "Setter for [`birthday`](Self::birthday).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_birthday(mut self, val: String) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("birthday".to_string(), val.into());
        self
    }
    #[doc = "The telephone numbers for the user.\n\n NOTE: Although it's a string collection, only one number can be set for this property. Read-only for users synced from the on-premises directory. Returned by default. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub fn business_phones(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .0
            .get("businessPhones")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`business_phones`](Self::business_phones).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_business_phones(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("businessPhones".to_string(), val.into());
        self
    }
    #[doc = "The city where the user is located.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn city(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("city").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`city`](Self::city).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_city(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("city".to_string(), val.into());
        self
    }
    #[doc = "The name of the company that the user is associated with.\n\n This property can be useful for describing the company that a guest comes from. The maximum length is 64 characters.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn company_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("companyName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`company_name`](Self::company_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_company_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("companyName".to_string(), val.into());
        self
    }
    #[doc = "Sets whether consent was obtained for minors.\n\n Allowed values: `null`, `Granted`, `Denied`, and `NotRequired`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn consent_provided_for_minor(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("consentProvidedForMinor")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`consent_provided_for_minor`](Self::consent_provided_for_minor).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_consent_provided_for_minor(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("consentProvidedForMinor".to_string(), val.into());
        self
    }
    #[doc = "The country or region where the user is located; for example, US or UK.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn country(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("country").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`country`](Self::country).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_country(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("country".to_string(), val.into());
        self
    }
    #[doc = "The date and time the user was created, in ISO 8601 format and UTC.\n\n The value can't be modified and is automatically populated when the entity is created. Nullable. For on-premises users, the value represents when they were first created in Microsoft Entra ID. Property is null for some users created before June 2018 and on-premises users that were synced to Microsoft Entra ID before June 2018. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn created_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("createdDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`created_date_time`](Self::created_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_created_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("createdDateTime".to_string(), val.into());
        self
    }
    #[doc = "Indicates whether the user account was created through one of the following methods:  As a regular school or work account (null).\n\n As an external account (Invitation). As a local account for an Azure Active Directory B2C tenant (LocalAccount). Through self-service sign-up by an internal user using email verification (EmailVerified). Through self-service sign-up by a guest signing up through a link that is part of a user flow (SelfServiceSignUp). Read-only.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn creation_type(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("creationType")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`creation_type`](Self::creation_type).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_creation_type(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("creationType".to_string(), val.into());
        self
    }
    #[doc = "The name of the department in which the user works.\n\n Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, and `eq` on null values)."]
    pub fn department(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("department").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`department`](Self::department).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_department(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("department".to_string(), val.into());
        self
    }
    #[doc = "The limit on the maximum number of devices that the user is permitted to enroll.\n\n Allowed values are 5 or 1000."]
    pub fn device_enrollment_limit(&self) -> Result<i32, Error> {
        let val = self
            .properties
            .0
            .get("deviceEnrollmentLimit")
            .ok_or(Error::NotFound)?;
        val.as_i64()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .try_into()
            .map_err(|e| Error::UnexpectedResponse(format!("{e:?}")))
    }
    #[doc = "Setter for [`device_enrollment_limit`](Self::device_enrollment_limit).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_device_enrollment_limit(mut self, val: i32) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("deviceEnrollmentLimit".to_string(), val.into());
        self
    }
    #[doc = "Accessor to inhereted properties from `DirectoryObject`."]
    #[must_use]
    pub fn directory_object(&'a self) -> DirectoryObject<'a> {
        DirectoryObject {
            properties: PropertyMap(Cow::Borrowed(&*self.properties.0)),
        }
    }
    #[doc = "Setter for [`directory_object`](Self::directory_object).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_directory_object(mut self, mut val: DirectoryObject<'_>) -> Self {
        self.properties.0.to_mut().append(val.properties.0.to_mut());
        self
    }
    #[doc = "The name displayed in the address book for the user.\n\n This value is usually the combination of the user's first name, middle initial, and family name. This property is required when a user is created and it can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values), `$orderby`, and `$search`."]
    pub fn display_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("displayName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`display_name`](Self::display_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_display_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("displayName".to_string(), val.into());
        self
    }
    #[doc = "The date and time when the user was hired or will start work in a future hire.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn employee_hire_date(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("employeeHireDate")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`employee_hire_date`](Self::employee_hire_date).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_employee_hire_date(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("employeeHireDate".to_string(), val.into());
        self
    }
    #[doc = "The employee identifier assigned to the user by the organization.\n\n The maximum length is 16 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn employee_id(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("employeeId").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`employee_id`](Self::employee_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_employee_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("employeeId".to_string(), val.into());
        self
    }
    #[doc = "The date and time when the user left or will leave the organization.\n\n To read this property, the calling app must be assigned the User-LifeCycleInfo.Read.All permission. To write this property, the calling app must be assigned the User.Read.All and User-LifeCycleInfo.ReadWrite.All permissions. To read this property in delegated scenarios, the admin needs at least one of the following Microsoft Entra roles: Lifecycle Workflows Administrator (least privilege), Global Reader. To write this property in delegated scenarios, the admin needs the Global Administrator role. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`). For more information, see Configure the employeeLeaveDateTime property for a user."]
    pub fn employee_leave_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("employeeLeaveDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`employee_leave_date_time`](Self::employee_leave_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_employee_leave_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("employeeLeaveDateTime".to_string(), val.into());
        self
    }
    #[doc = "Captures enterprise worker type.\n\n For example, Employee, Contractor, Consultant, or Vendor. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn employee_type(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("employeeType")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`employee_type`](Self::employee_type).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_employee_type(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("employeeType".to_string(), val.into());
        self
    }
    #[doc = "For a guest invited to the tenant using the invitation API, this property represents the invited user's invitation status.\n\n For invited users, the state can be PendingAcceptance or Accepted, or null for all other users. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn external_user_state(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("externalUserState")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`external_user_state`](Self::external_user_state).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_external_user_state(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("externalUserState".to_string(), val.into());
        self
    }
    #[doc = "Shows the timestamp for the latest change to the externalUserState property.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn external_user_state_change_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("externalUserStateChangeDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`external_user_state_change_date_time`](Self::external_user_state_change_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_external_user_state_change_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("externalUserStateChangeDateTime".to_string(), val.into());
        self
    }
    #[doc = "The fax number of the user.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn fax_number(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("faxNumber").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`fax_number`](Self::fax_number).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_fax_number(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("faxNumber".to_string(), val.into());
        self
    }
    #[doc = "The given name (first name) of the user.\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn given_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("givenName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`given_name`](Self::given_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_given_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("givenName".to_string(), val.into());
        self
    }
    #[doc = "The hire date of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`.  Note: This property is specific to SharePoint in Microsoft 365. We recommend using the native employeeHireDate property to set and update hire date values using Microsoft Graph APIs."]
    pub fn hire_date(&self) -> Result<&str, Error> {
        let val = self.properties.0.get("hireDate").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))
    }
    #[doc = "Setter for [`hire_date`](Self::hire_date).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_hire_date(mut self, val: String) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("hireDate".to_string(), val.into());
        self
    }
    #[doc = "The instant message voice-over IP (VOIP) session initiation protocol (SIP) addresses for the user.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub fn im_addresses(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .0
            .get("imAddresses")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`im_addresses`](Self::im_addresses).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_im_addresses(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("imAddresses".to_string(), val.into());
        self
    }
    #[doc = "A list for the user to describe their interests.\n\n Returned only on `$select`."]
    pub fn interests(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.0.get("interests").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`interests`](Self::interests).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_interests(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("interests".to_string(), val.into());
        self
    }
    #[doc = "true if the user is a member of a restricted management administrative unit.\n\n If not set, the default value is null and the default behavior is false. Read-only.  To manage a user who is a member of a restricted management administrative unit, the administrator or calling app must be assigned a Microsoft Entra role at the scope of the restricted management administrative unit. Returned only on `$select`."]
    pub fn is_management_restricted(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("isManagementRestricted")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_management_restricted`](Self::is_management_restricted).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_management_restricted(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isManagementRestricted".to_string(), val.into());
        self
    }
    #[doc = "Don't use – reserved for future use."]
    pub fn is_resource_account(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("isResourceAccount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_resource_account`](Self::is_resource_account).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_resource_account(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isResourceAccount".to_string(), val.into());
        self
    }
    #[doc = "The user's job title.\n\n Maximum length is 128 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn job_title(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("jobTitle").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`job_title`](Self::job_title).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_job_title(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("jobTitle".to_string(), val.into());
        self
    }
    #[doc = "The time when this Microsoft Entra user last changed their password or when their password was created, whichever date the latest action was performed.\n\n The date and time information uses ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub fn last_password_change_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("lastPasswordChangeDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`last_password_change_date_time`](Self::last_password_change_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_last_password_change_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("lastPasswordChangeDateTime".to_string(), val.into());
        self
    }
    #[doc = "Used by enterprise applications to determine the legal age group of the user.\n\n This property is read-only and calculated based on ageGroup and consentProvidedForMinor properties. Allowed values: `null`, `Undefined`, `MinorWithOutParentalConsent`, `MinorWithParentalConsent`, `MinorNoParentalConsentRequired`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`."]
    pub fn legal_age_group_classification(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("legalAgeGroupClassification")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`legal_age_group_classification`](Self::legal_age_group_classification).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_legal_age_group_classification(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("legalAgeGroupClassification".to_string(), val.into());
        self
    }
    #[doc = "The SMTP address for the user, for example, jeff@contoso.com.\n\n Changes to this property update the user's proxyAddresses collection to include the value as an SMTP address. This property can't contain accent characters.  NOTE: We don't recommend updating this property for Azure AD B2C user profiles. Use the otherMails property instead. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, and `eq` on null values)."]
    pub fn mail(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("mail").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`mail`](Self::mail).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_mail(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("mail".to_string(), val.into());
        self
    }
    #[doc = "The mail alias for the user.\n\n This property must be specified when a user is created. Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn mail_nickname(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("mailNickname")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`mail_nickname`](Self::mail_nickname).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_mail_nickname(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("mailNickname".to_string(), val.into());
        self
    }
    #[doc = "Settings for the primary mailbox of the signed-in user.\n\n You can get or update settings for sending automatic replies to incoming messages, locale, and time zone. Returned only on `$select`."]
    pub fn mailbox_settings(&'a self) -> Result<MailboxSettings<'a>, Error> {
        let val = self
            .properties
            .0
            .get("mailboxSettings")
            .ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`mailbox_settings`](Self::mailbox_settings).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_mailbox_settings(mut self, val: MailboxSettings<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "mailboxSettings".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "The primary cellular telephone number for the user.\n\n Read-only for users synced from the on-premises directory. Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values) and `$search`."]
    pub fn mobile_phone(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("mobilePhone")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`mobile_phone`](Self::mobile_phone).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_mobile_phone(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("mobilePhone".to_string(), val.into());
        self
    }
    #[doc = "The URL for the user's site.\n\n Returned only on `$select`."]
    pub fn my_site(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("mySite").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`my_site`](Self::my_site).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_my_site(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("mySite".to_string(), val.into());
        self
    }
    #[doc = "The office location in the user's place of business.\n\n Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn office_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("officeLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`office_location`](Self::office_location).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_office_location(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("officeLocation".to_string(), val.into());
        self
    }
    #[doc = "Contains the on-premises Active Directory distinguished name or DN.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub fn on_premises_distinguished_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesDistinguishedName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_distinguished_name`](Self::on_premises_distinguished_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_distinguished_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesDistinguishedName".to_string(), val.into());
        self
    }
    #[doc = "Contains the on-premises domainFQDN, also called dnsDomainName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub fn on_premises_domain_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesDomainName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_domain_name`](Self::on_premises_domain_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_domain_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesDomainName".to_string(), val.into());
        self
    }
    #[doc = "This property is used to associate an on-premises Active Directory user account to their Microsoft Entra user object.\n\n This property must be specified when creating a new user account in the Graph if you're using a federated domain for the user's userPrincipalName (UPN) property. NOTE: The $ and _ characters can't be used when specifying this property. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn on_premises_immutable_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesImmutableId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_immutable_id`](Self::on_premises_immutable_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_immutable_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesImmutableId".to_string(), val.into());
        self
    }
    #[doc = "Indicates the last time at which the object was synced with the on-premises directory; for example: `2013-02-16T03:04:54Z`.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn on_premises_last_sync_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesLastSyncDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_last_sync_date_time`](Self::on_premises_last_sync_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_last_sync_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesLastSyncDateTime".to_string(), val.into());
        self
    }
    #[doc = "Contains the on-premises samAccountName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn on_premises_sam_account_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesSamAccountName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_sam_account_name`](Self::on_premises_sam_account_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_sam_account_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesSamAccountName".to_string(), val.into());
        self
    }
    #[doc = "Contains the on-premises security identifier (SID) for the user that was synchronized from on-premises to the cloud.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq including on null values`)."]
    pub fn on_premises_security_identifier(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesSecurityIdentifier")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_security_identifier`](Self::on_premises_security_identifier).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_security_identifier(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesSecurityIdentifier".to_string(), val.into());
        self
    }
    #[doc = "true if this user object is currently being synced from an on-premises Active Directory (AD); otherwise the user isn't being synced and can be managed in Microsoft Entra ID.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values)."]
    pub fn on_premises_sync_enabled(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesSyncEnabled")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_sync_enabled`](Self::on_premises_sync_enabled).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_sync_enabled(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesSyncEnabled".to_string(), val.into());
        self
    }
    #[doc = "Contains the on-premises userPrincipalName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn on_premises_user_principal_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("onPremisesUserPrincipalName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`on_premises_user_principal_name`](Self::on_premises_user_principal_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_on_premises_user_principal_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("onPremisesUserPrincipalName".to_string(), val.into());
        self
    }
    #[doc = "A list of other email addresses for the user; for example: `['bob@contoso.com', 'Robert@fabrikam.com']`.\n\n Can store up to 250 values, each with a limit of 250 characters. NOTE: This property can't contain accent characters. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub fn other_mails(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.0.get("otherMails").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`other_mails`](Self::other_mails).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_other_mails(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("otherMails".to_string(), val.into());
        self
    }
    #[doc = "Specifies password policies for the user.\n\n This value is an enumeration with one possible value being DisableStrongPassword, which allows weaker passwords than the default policy to be specified. DisablePasswordExpiration can also be specified. The two might be specified together; for example: `DisablePasswordExpiration, DisableStrongPassword`. Returned only on `$select`. For more information on the default password policies, see Microsoft Entra password policies. Supports `$filter` (`ne`, `not`, and `eq` on null values)."]
    pub fn password_policies(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("passwordPolicies")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`password_policies`](Self::password_policies).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_password_policies(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("passwordPolicies".to_string(), val.into());
        self
    }
    #[doc = "A list for the user to enumerate their past projects.\n\n Returned only on `$select`."]
    pub fn past_projects(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .0
            .get("pastProjects")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`past_projects`](Self::past_projects).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_past_projects(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("pastProjects".to_string(), val.into());
        self
    }
    #[doc = "The postal code for the user's postal address.\n\n The postal code is specific to the user's country or region. In the United States of America, this attribute contains the ZIP code. Maximum length is 40 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn postal_code(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("postalCode").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`postal_code`](Self::postal_code).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_postal_code(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("postalCode".to_string(), val.into());
        self
    }
    #[doc = "The preferred data location for the user.\n\n For more information, see OneDrive Online Multi-Geo."]
    pub fn preferred_data_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("preferredDataLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`preferred_data_location`](Self::preferred_data_location).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_preferred_data_location(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("preferredDataLocation".to_string(), val.into());
        self
    }
    #[doc = "The preferred language for the user.\n\n The preferred language format is based on RFC 4646. The name is a combination of an ISO 639 two-letter lowercase culture code associated with the language, and an ISO 3166 two-letter uppercase subculture code associated with the country or region. Example: 'en-US', or 'es-ES'. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)"]
    pub fn preferred_language(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("preferredLanguage")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`preferred_language`](Self::preferred_language).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_preferred_language(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("preferredLanguage".to_string(), val.into());
        self
    }
    #[doc = "The preferred name for the user.\n\n Not Supported. This attribute returns an empty string.Returned only on `$select`."]
    pub fn preferred_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("preferredName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`preferred_name`](Self::preferred_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_preferred_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("preferredName".to_string(), val.into());
        self
    }
    #[doc = "For example: `['SMTP: bob@contoso.com', 'smtp: bob@sales.contoso.com']`.\n\n Changes to the mail property update this collection to include the value as an SMTP address. For more information, see mail and proxyAddresses properties. The proxy address prefixed with SMTP (capitalized) is the primary proxy address, while those addresses prefixed with smtp are the secondary proxy addresses. For Azure AD B2C accounts, this property has a limit of 10 unique addresses. Read-only in Microsoft Graph; you can update this property only through the Microsoft 365 admin center. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub fn proxy_addresses(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .0
            .get("proxyAddresses")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`proxy_addresses`](Self::proxy_addresses).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_proxy_addresses(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("proxyAddresses".to_string(), val.into());
        self
    }
    #[doc = "A list for the user to enumerate their responsibilities.\n\n Returned only on `$select`."]
    pub fn responsibilities(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .0
            .get("responsibilities")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`responsibilities`](Self::responsibilities).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_responsibilities(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("responsibilities".to_string(), val.into());
        self
    }
    #[doc = "A list for the user to enumerate the schools they attended.\n\n Returned only on `$select`."]
    pub fn schools(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.0.get("schools").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`schools`](Self::schools).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_schools(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("schools".to_string(), val.into());
        self
    }
    #[doc = "Security identifier (SID) of the user, used in Windows scenarios.\n\n Read-only. Returned by default. Supports `$select` and `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub fn security_identifier(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("securityIdentifier")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`security_identifier`](Self::security_identifier).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_security_identifier(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("securityIdentifier".to_string(), val.into());
        self
    }
    #[doc = "Do not use in Microsoft Graph.\n\n Manage this property through the Microsoft 365 admin center instead. Represents whether the user should be included in the Outlook global address list. See Known issue."]
    pub fn show_in_address_list(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("showInAddressList")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`show_in_address_list`](Self::show_in_address_list).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_show_in_address_list(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("showInAddressList".to_string(), val.into());
        self
    }
    #[doc = "Any refresh tokens or session tokens (session cookies) issued before this time are invalid.\n\n Applications get an error when using an invalid refresh or session token to acquire a delegated access token (to access APIs such as Microsoft Graph). If this happens, the application needs to acquire a new refresh token by requesting the authorized endpoint. Read-only. Use revokeSignInSessions to reset. Returned only on `$select`."]
    pub fn sign_in_sessions_valid_from_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("signInSessionsValidFromDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`sign_in_sessions_valid_from_date_time`](Self::sign_in_sessions_valid_from_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_sign_in_sessions_valid_from_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("signInSessionsValidFromDateTime".to_string(), val.into());
        self
    }
    #[doc = "A list for the user to enumerate their skills.\n\n Returned only on `$select`."]
    pub fn skills(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.0.get("skills").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`skills`](Self::skills).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_skills(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("skills".to_string(), val.into());
        self
    }
    #[doc = "The state or province in the user's address.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn state(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("state").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`state`](Self::state).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_state(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("state".to_string(), val.into());
        self
    }
    #[doc = "The street address of the user's place of business.\n\n Maximum length is 1,024 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn street_address(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("streetAddress")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`street_address`](Self::street_address).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_street_address(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("streetAddress".to_string(), val.into());
        self
    }
    #[doc = "The user's surname (family name or last name).\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn surname(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("surname").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`surname`](Self::surname).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_surname(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("surname".to_string(), val.into());
        self
    }
    #[doc = "A two-letter country code (ISO standard 3166).\n\n Required for users that are assigned licenses due to legal requirements to check for availability of services in countries/regions. Examples include: US, JP, and GB. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn usage_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("usageLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`usage_location`](Self::usage_location).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_usage_location(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("usageLocation".to_string(), val.into());
        self
    }
    #[doc = "The user principal name (UPN) of the user.\n\n The UPN is an Internet-style sign-in name for the user based on the Internet standard RFC 822. By convention, this value should map to the user's email name. The general format is alias@domain, where the domain must be present in the tenant's collection of verified domains. This property is required when a user is created. The verified domains for the tenant can be accessed from the verifiedDomains property of organization.NOTE: This property can't contain accent characters. Only the following characters are allowed A - Z, a - z, 0 - 9, ' . - _ ! # ^ ~. For the complete list of allowed characters, see username policies. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`) and `$orderby`."]
    pub fn user_principal_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("userPrincipalName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`user_principal_name`](Self::user_principal_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_user_principal_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("userPrincipalName".to_string(), val.into());
        self
    }
    #[doc = "A string value that can be used to classify user types in your directory.\n\n The possible values are Member and Guest. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values). NOTE: For more information about the permissions for members and guests, see What are the default user permissions in Microsoft Entra ID?"]
    pub fn user_type(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("userType").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`user_type`](Self::user_type).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_user_type(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("userType".to_string(), val.into());
        self
    }
}

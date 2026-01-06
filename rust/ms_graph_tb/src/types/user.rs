/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to User. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::directory_object::*;
use crate::types::mailbox_settings::*;
use crate::Error;
use serde::Deserialize;
use serde_json::{Map, Value};
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
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct User<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> User<'a> {
    #[doc = r" Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        User {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "A freeform text entry field for the user to describe themselves.\n\n Returned only on `$select`."]
    pub fn about_me(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("aboutMe").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "true if the account is enabled; otherwise, false.\n\n This property is required when a user is created. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn account_enabled(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("accountEnabled")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Sets the age group of the user.\n\n Allowed values: `null`, `Minor`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn age_group(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("ageGroup").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The birthday of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub fn birthday(&self) -> Result<&str, Error> {
        let val = self.properties.get("birthday").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))
    }
    #[doc = "The telephone numbers for the user.\n\n NOTE: Although it's a string collection, only one number can be set for this property. Read-only for users synced from the on-premises directory. Returned by default. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
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
    #[doc = "The city where the user is located.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn city(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("city").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The name of the company that the user is associated with.\n\n This property can be useful for describing the company that a guest comes from. The maximum length is 64 characters.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn company_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("companyName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Sets whether consent was obtained for minors.\n\n Allowed values: `null`, `Granted`, `Denied`, and `NotRequired`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub fn consent_provided_for_minor(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("consentProvidedForMinor")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The country or region where the user is located; for example, US or UK.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn country(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("country").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date and time the user was created, in ISO 8601 format and UTC.\n\n The value can't be modified and is automatically populated when the entity is created. Nullable. For on-premises users, the value represents when they were first created in Microsoft Entra ID. Property is null for some users created before June 2018 and on-premises users that were synced to Microsoft Entra ID before June 2018. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn created_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("createdDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether the user account was created through one of the following methods:  As a regular school or work account (null).\n\n As an external account (Invitation). As a local account for an Azure Active Directory B2C tenant (LocalAccount). Through self-service sign-up by an internal user using email verification (EmailVerified). Through self-service sign-up by a guest signing up through a link that is part of a user flow (SelfServiceSignUp). Read-only.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn creation_type(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("creationType").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The name of the department in which the user works.\n\n Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, and `eq` on null values)."]
    pub fn department(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("department").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The limit on the maximum number of devices that the user is permitted to enroll.\n\n Allowed values are 5 or 1000."]
    pub fn device_enrollment_limit(&self) -> Result<i32, Error> {
        let val = self
            .properties
            .get("deviceEnrollmentLimit")
            .ok_or(Error::NotFound)?;
        val.as_i64()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .try_into()
            .map_err(|e| Error::UnexpectedResponse(format!("{:?}", e)))
    }
    #[doc = "Accessor to inhereted properties from `DirectoryObject`."]
    pub fn directory_object(&'a self) -> DirectoryObject<'a> {
        DirectoryObject {
            properties: Cow::Borrowed(&*self.properties),
        }
    }
    #[doc = "The name displayed in the address book for the user.\n\n This value is usually the combination of the user's first name, middle initial, and family name. This property is required when a user is created and it can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values), `$orderby`, and `$search`."]
    pub fn display_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("displayName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date and time when the user was hired or will start work in a future hire.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn employee_hire_date(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("employeeHireDate")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The employee identifier assigned to the user by the organization.\n\n The maximum length is 16 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn employee_id(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("employeeId").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date and time when the user left or will leave the organization.\n\n To read this property, the calling app must be assigned the User-LifeCycleInfo.Read.All permission. To write this property, the calling app must be assigned the User.Read.All and User-LifeCycleInfo.ReadWrite.All permissions. To read this property in delegated scenarios, the admin needs at least one of the following Microsoft Entra roles: Lifecycle Workflows Administrator (least privilege), Global Reader. To write this property in delegated scenarios, the admin needs the Global Administrator role. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`). For more information, see Configure the employeeLeaveDateTime property for a user."]
    pub fn employee_leave_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("employeeLeaveDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Captures enterprise worker type.\n\n For example, Employee, Contractor, Consultant, or Vendor. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn employee_type(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("employeeType").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "For a guest invited to the tenant using the invitation API, this property represents the invited user's invitation status.\n\n For invited users, the state can be PendingAcceptance or Accepted, or null for all other users. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn external_user_state(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("externalUserState")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Shows the timestamp for the latest change to the externalUserState property.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub fn external_user_state_change_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("externalUserStateChangeDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The fax number of the user.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn fax_number(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("faxNumber").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The given name (first name) of the user.\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn given_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("givenName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The hire date of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`.  Note: This property is specific to SharePoint in Microsoft 365. We recommend using the native employeeHireDate property to set and update hire date values using Microsoft Graph APIs."]
    pub fn hire_date(&self) -> Result<&str, Error> {
        let val = self.properties.get("hireDate").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))
    }
    #[doc = "The instant message voice-over IP (VOIP) session initiation protocol (SIP) addresses for the user.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub fn im_addresses(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("imAddresses").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "A list for the user to describe their interests.\n\n Returned only on `$select`."]
    pub fn interests(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("interests").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "true if the user is a member of a restricted management administrative unit.\n\n If not set, the default value is null and the default behavior is false. Read-only.  To manage a user who is a member of a restricted management administrative unit, the administrator or calling app must be assigned a Microsoft Entra role at the scope of the restricted management administrative unit. Returned only on `$select`."]
    pub fn is_management_restricted(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("isManagementRestricted")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Don't use – reserved for future use."]
    pub fn is_resource_account(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("isResourceAccount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The user's job title.\n\n Maximum length is 128 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn job_title(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("jobTitle").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The time when this Microsoft Entra user last changed their password or when their password was created, whichever date the latest action was performed.\n\n The date and time information uses ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub fn last_password_change_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("lastPasswordChangeDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Used by enterprise applications to determine the legal age group of the user.\n\n This property is read-only and calculated based on ageGroup and consentProvidedForMinor properties. Allowed values: `null`, `Undefined`, `MinorWithOutParentalConsent`, `MinorWithParentalConsent`, `MinorNoParentalConsentRequired`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`."]
    pub fn legal_age_group_classification(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("legalAgeGroupClassification")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The SMTP address for the user, for example, jeff@contoso.com.\n\n Changes to this property update the user's proxyAddresses collection to include the value as an SMTP address. This property can't contain accent characters.  NOTE: We don't recommend updating this property for Azure AD B2C user profiles. Use the otherMails property instead. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, and `eq` on null values)."]
    pub fn mail(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mail").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The mail alias for the user.\n\n This property must be specified when a user is created. Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn mail_nickname(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mailNickname").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Settings for the primary mailbox of the signed-in user.\n\n You can get or update settings for sending automatic replies to incoming messages, locale, and time zone. Returned only on `$select`."]
    pub fn mailbox_settings(&'a self) -> Result<MailboxSettings<'a>, Error> {
        let val = self
            .properties
            .get("mailboxSettings")
            .ok_or(Error::NotFound)?;
        Ok(MailboxSettings::new(val.as_object().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The primary cellular telephone number for the user.\n\n Read-only for users synced from the on-premises directory. Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values) and `$search`."]
    pub fn mobile_phone(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mobilePhone").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The URL for the user's site.\n\n Returned only on `$select`."]
    pub fn my_site(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("mySite").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The office location in the user's place of business.\n\n Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
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
    #[doc = "Contains the on-premises Active Directory distinguished name or DN.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub fn on_premises_distinguished_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesDistinguishedName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Contains the on-premises domainFQDN, also called dnsDomainName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub fn on_premises_domain_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesDomainName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "This property is used to associate an on-premises Active Directory user account to their Microsoft Entra user object.\n\n This property must be specified when creating a new user account in the Graph if you're using a federated domain for the user's userPrincipalName (UPN) property. NOTE: The $ and _ characters can't be used when specifying this property. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn on_premises_immutable_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesImmutableId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates the last time at which the object was synced with the on-premises directory; for example: `2013-02-16T03:04:54Z`.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub fn on_premises_last_sync_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesLastSyncDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Contains the on-premises samAccountName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn on_premises_sam_account_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesSamAccountName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Contains the on-premises security identifier (SID) for the user that was synchronized from on-premises to the cloud.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq including on null values`)."]
    pub fn on_premises_security_identifier(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesSecurityIdentifier")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "true if this user object is currently being synced from an on-premises Active Directory (AD); otherwise the user isn't being synced and can be managed in Microsoft Entra ID.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values)."]
    pub fn on_premises_sync_enabled(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("onPremisesSyncEnabled")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Contains the on-premises userPrincipalName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub fn on_premises_user_principal_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("onPremisesUserPrincipalName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "A list of other email addresses for the user; for example: `['bob@contoso.com', 'Robert@fabrikam.com']`.\n\n Can store up to 250 values, each with a limit of 250 characters. NOTE: This property can't contain accent characters. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub fn other_mails(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("otherMails").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Specifies password policies for the user.\n\n This value is an enumeration with one possible value being DisableStrongPassword, which allows weaker passwords than the default policy to be specified. DisablePasswordExpiration can also be specified. The two might be specified together; for example: `DisablePasswordExpiration, DisableStrongPassword`. Returned only on `$select`. For more information on the default password policies, see Microsoft Entra password policies. Supports `$filter` (`ne`, `not`, and `eq` on null values)."]
    pub fn password_policies(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("passwordPolicies")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "A list for the user to enumerate their past projects.\n\n Returned only on `$select`."]
    pub fn past_projects(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("pastProjects").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "The postal code for the user's postal address.\n\n The postal code is specific to the user's country or region. In the United States of America, this attribute contains the ZIP code. Maximum length is 40 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn postal_code(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("postalCode").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The preferred data location for the user.\n\n For more information, see OneDrive Online Multi-Geo."]
    pub fn preferred_data_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("preferredDataLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The preferred language for the user.\n\n The preferred language format is based on RFC 4646. The name is a combination of an ISO 639 two-letter lowercase culture code associated with the language, and an ISO 3166 two-letter uppercase subculture code associated with the country or region. Example: 'en-US', or 'es-ES'. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)"]
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
    #[doc = "The preferred name for the user.\n\n Not Supported. This attribute returns an empty string.Returned only on `$select`."]
    pub fn preferred_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("preferredName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "For example: `['SMTP: bob@contoso.com', 'smtp: bob@sales.contoso.com']`.\n\n Changes to the mail property update this collection to include the value as an SMTP address. For more information, see mail and proxyAddresses properties. The proxy address prefixed with SMTP (capitalized) is the primary proxy address, while those addresses prefixed with smtp are the secondary proxy addresses. For Azure AD B2C accounts, this property has a limit of 10 unique addresses. Read-only in Microsoft Graph; you can update this property only through the Microsoft 365 admin center. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub fn proxy_addresses(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .get("proxyAddresses")
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
    #[doc = "A list for the user to enumerate their responsibilities.\n\n Returned only on `$select`."]
    pub fn responsibilities(&self) -> Result<Vec<&str>, Error> {
        let val = self
            .properties
            .get("responsibilities")
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
    #[doc = "A list for the user to enumerate the schools they attended.\n\n Returned only on `$select`."]
    pub fn schools(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("schools").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Security identifier (SID) of the user, used in Windows scenarios.\n\n Read-only. Returned by default. Supports `$select` and `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub fn security_identifier(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("securityIdentifier")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Do not use in Microsoft Graph.\n\n Manage this property through the Microsoft 365 admin center instead. Represents whether the user should be included in the Outlook global address list. See Known issue."]
    pub fn show_in_address_list(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("showInAddressList")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Any refresh tokens or session tokens (session cookies) issued before this time are invalid.\n\n Applications get an error when using an invalid refresh or session token to acquire a delegated access token (to access APIs such as Microsoft Graph). If this happens, the application needs to acquire a new refresh token by requesting the authorized endpoint. Read-only. Use revokeSignInSessions to reset. Returned only on `$select`."]
    pub fn sign_in_sessions_valid_from_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("signInSessionsValidFromDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "A list for the user to enumerate their skills.\n\n Returned only on `$select`."]
    pub fn skills(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("skills").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "The state or province in the user's address.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn state(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("state").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The street address of the user's place of business.\n\n Maximum length is 1,024 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn street_address(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("streetAddress")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The user's surname (family name or last name).\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn surname(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("surname").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "A two-letter country code (ISO standard 3166).\n\n Required for users that are assigned licenses due to legal requirements to check for availability of services in countries/regions. Examples include: US, JP, and GB. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fn usage_location(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("usageLocation")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The user principal name (UPN) of the user.\n\n The UPN is an Internet-style sign-in name for the user based on the Internet standard RFC 822. By convention, this value should map to the user's email name. The general format is alias@domain, where the domain must be present in the tenant's collection of verified domains. This property is required when a user is created. The verified domains for the tenant can be accessed from the verifiedDomains property of organization.NOTE: This property can't contain accent characters. Only the following characters are allowed A - Z, a - z, 0 - 9, ' . - _ ! # ^ ~. For the complete list of allowed characters, see username policies. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`) and `$orderby`."]
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
    #[doc = "A string value that can be used to classify user types in your directory.\n\n The possible values are Member and Guest. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values). NOTE: For more information about the permissions for members and guests, see What are the default user permissions in Microsoft Entra ID?"]
    pub fn user_type(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("userType").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}

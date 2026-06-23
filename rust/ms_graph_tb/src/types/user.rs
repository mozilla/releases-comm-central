/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to User.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::odata::ExpandOptions;
use crate::types::directory_object::{DirectoryObject, DirectoryObjectSelection};
use crate::types::mail_folder::{MailFolder, MailFolderSelection};
use crate::types::mailbox_settings::MailboxSettings;
use crate::types::message::{Message, MessageSelection};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use std::fmt;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
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
    IdentityParentId,
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
#[doc = r"Types that are syntactically valid to expand for this type."]
#[doc = r""]
#[doc = r" Being present in this enum does not guarantee Graph can expand"]
#[doc = r" the property for any particular path."]
#[derive(Clone, Debug, strum :: EnumDiscriminants)]
#[strum_discriminants(name(ExpandNames))]
#[strum_discriminants(vis(pub(self)))]
#[strum_discriminants(derive(Display))]
#[strum_discriminants(strum(serialize_all = "camelCase"))]
pub enum UserExpand {
    CreatedObjects(ExpandOptions<DirectoryObjectSelection>),
    DirectReports(ExpandOptions<DirectoryObjectSelection>),
    MailFolders(ExpandOptions<MailFolderSelection>),
    Manager(ExpandOptions<DirectoryObjectSelection>),
    MemberOf(ExpandOptions<DirectoryObjectSelection>),
    Messages(ExpandOptions<MessageSelection>),
    OwnedDevices(ExpandOptions<DirectoryObjectSelection>),
    OwnedObjects(ExpandOptions<DirectoryObjectSelection>),
    RegisteredDevices(ExpandOptions<DirectoryObjectSelection>),
    Sponsors(ExpandOptions<DirectoryObjectSelection>),
    TransitiveMemberOf(ExpandOptions<DirectoryObjectSelection>),
}
impl fmt::Display for UserExpand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UserExpand::CreatedObjects(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::DirectReports(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::MailFolders(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::Manager(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::MemberOf(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::Messages(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::OwnedDevices(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::OwnedObjects(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::RegisteredDevices(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::Sponsors(opt) => opt.full_format(f, ExpandNames::from(self)),
            UserExpand::TransitiveMemberOf(opt) => opt.full_format(f, ExpandNames::from(self)),
        }
    }
}
#[doc = "Represents a Microsoft Entra user account."]
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct User {
    #[doc = "A freeform text entry field for the user to describe themselves.\n\n Returned only on `$select`."]
    pub about_me: Option<Nullable<String>>,
    #[doc = "true if the account is enabled; otherwise, false.\n\n This property is required when a user is created. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub account_enabled: Option<Nullable<bool>>,
    #[doc = "Sets the age group of the user.\n\n Allowed values: `null`, `Minor`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub age_group: Option<Nullable<String>>,
    #[doc = "The birthday of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub birthday: Option<String>,
    #[doc = "The telephone numbers for the user.\n\n NOTE: Although it's a string collection, only one number can be set for this property. Read-only for users synced from the on-premises directory. Returned by default. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub business_phones: Option<Vec<String>>,
    #[doc = "The city where the user is located.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub city: Option<Nullable<String>>,
    #[doc = "The name of the company that the user is associated with.\n\n This property can be useful for describing the company that a guest comes from. The maximum length is 64 characters.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub company_name: Option<Nullable<String>>,
    #[doc = "Sets whether consent was obtained for minors.\n\n Allowed values: `null`, `Granted`, `Denied`, and `NotRequired`. For more information, see legal age group property definitions. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, and `in`)."]
    pub consent_provided_for_minor: Option<Nullable<String>>,
    #[doc = "The country or region where the user is located; for example, US or UK.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub country: Option<Nullable<String>>,
    #[doc = "The date and time the user was created, in ISO 8601 format and UTC.\n\n The value can't be modified and is automatically populated when the entity is created. Nullable. For on-premises users, the value represents when they were first created in Microsoft Entra ID. Property is null for some users created before June 2018 and on-premises users that were synced to Microsoft Entra ID before June 2018. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub created_date_time: Option<Nullable<String>>,
    #[doc = "Directory objects that the user created.\n\n Read-only. Nullable."]
    pub created_objects: Option<Vec<DirectoryObject>>,
    #[doc = "Indicates whether the user account was created through one of the following methods:  As a regular school or work account (null).\n\n As an external account (Invitation). As a local account for an Azure Active Directory B2C tenant (LocalAccount). Through self-service sign-up by an internal user using email verification (EmailVerified). Through self-service sign-up by a guest signing up through a link that is part of a user flow (SelfServiceSignUp). Read-only.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub creation_type: Option<Nullable<String>>,
    #[doc = "The name of the department in which the user works.\n\n Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, and `eq` on null values)."]
    pub department: Option<Nullable<String>>,
    #[doc = "The limit on the maximum number of devices that the user is permitted to enroll.\n\n Allowed values are 5 or 1000."]
    pub device_enrollment_limit: Option<i32>,
    #[doc = "The users and contacts that report to the user.\n\n (The users and contacts that have their manager property set to this user.) Read-only. Nullable. Supports `$expand`."]
    pub direct_reports: Option<Vec<DirectoryObject>>,
    #[doc = "Inherited properties from `DirectoryObject`."]
    #[serde(flatten)]
    pub directory_object: DirectoryObject,
    #[doc = "The name displayed in the address book for the user.\n\n This value is usually the combination of the user's first name, middle initial, and family name. This property is required when a user is created and it can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values), `$orderby`, and `$search`."]
    pub display_name: Option<Nullable<String>>,
    #[doc = "The date and time when the user was hired or will start work in a future hire.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub employee_hire_date: Option<Nullable<String>>,
    #[doc = "The employee identifier assigned to the user by the organization.\n\n The maximum length is 16 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub employee_id: Option<Nullable<String>>,
    #[doc = "The date and time when the user left or will leave the organization.\n\n To read this property, the calling app must be assigned the User-LifeCycleInfo.Read.All permission. To write this property, the calling app must be assigned the User.Read.All and User-LifeCycleInfo.ReadWrite.All permissions. To read this property in delegated scenarios, the admin needs at least one of the following Microsoft Entra roles: Lifecycle Workflows Administrator (least privilege), Global Reader. To write this property in delegated scenarios, the admin needs the Global Administrator role. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`). For more information, see Configure the employeeLeaveDateTime property for a user."]
    pub employee_leave_date_time: Option<Nullable<String>>,
    #[doc = "Captures enterprise worker type.\n\n For example, Employee, Contractor, Consultant, or Vendor. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub employee_type: Option<Nullable<String>>,
    #[doc = "For a guest invited to the tenant using the invitation API, this property represents the invited user's invitation status.\n\n For invited users, the state can be PendingAcceptance or Accepted, or null for all other users. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub external_user_state: Option<Nullable<String>>,
    #[doc = "Shows the timestamp for the latest change to the externalUserState property.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`)."]
    pub external_user_state_change_date_time: Option<Nullable<String>>,
    #[doc = "The fax number of the user.\n\n Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub fax_number: Option<Nullable<String>>,
    #[doc = "The given name (first name) of the user.\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub given_name: Option<Nullable<String>>,
    #[doc = "The hire date of the user.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014, is 2014-01-01T00:00:00Z. Returned only on `$select`.  Note: This property is specific to SharePoint in Microsoft 365. We recommend using the native employeeHireDate property to set and update hire date values using Microsoft Graph APIs."]
    pub hire_date: Option<String>,
    pub identity_parent_id: Option<Nullable<String>>,
    #[doc = "The instant message voice-over IP (VOIP) session initiation protocol (SIP) addresses for the user.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub im_addresses: Option<Vec<String>>,
    #[doc = "A list for the user to describe their interests.\n\n Returned only on `$select`."]
    pub interests: Option<Vec<String>>,
    #[doc = "true if the user is a member of a restricted management administrative unit.\n\n If not set, the default value is null and the default behavior is false. Read-only.  To manage a user who is a member of a restricted management administrative unit, the administrator or calling app must be assigned a Microsoft Entra role at the scope of the restricted management administrative unit. Returned only on `$select`."]
    pub is_management_restricted: Option<Nullable<bool>>,
    #[doc = "Don't use – reserved for future use."]
    pub is_resource_account: Option<Nullable<bool>>,
    #[doc = "The user's job title.\n\n Maximum length is 128 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub job_title: Option<Nullable<String>>,
    #[doc = "The time when this Microsoft Entra user last changed their password or when their password was created, whichever date the latest action was performed.\n\n The date and time information uses ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Returned only on `$select`."]
    pub last_password_change_date_time: Option<Nullable<String>>,
    #[doc = "Used by enterprise applications to determine the legal age group of the user.\n\n This property is read-only and calculated based on ageGroup and consentProvidedForMinor properties. Allowed values: `null`, `Undefined`, `MinorWithOutParentalConsent`, `MinorWithParentalConsent`, `MinorNoParentalConsentRequired`, `NotAdult`, and `Adult`. For more information, see legal age group property definitions. Returned only on `$select`."]
    pub legal_age_group_classification: Option<Nullable<String>>,
    #[doc = "The SMTP address for the user, for example, jeff@contoso.com.\n\n Changes to this property update the user's proxyAddresses collection to include the value as an SMTP address. This property can't contain accent characters.  NOTE: We don't recommend updating this property for Azure AD B2C user profiles. Use the otherMails property instead. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, and `eq` on null values)."]
    pub mail: Option<Nullable<String>>,
    #[doc = "The user's mail folders.\n\n Read-only. Nullable."]
    pub mail_folders: Option<Vec<MailFolder>>,
    #[doc = "The mail alias for the user.\n\n This property must be specified when a user is created. Maximum length is 64 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub mail_nickname: Option<Nullable<String>>,
    #[doc = "Settings for the primary mailbox of the signed-in user.\n\n You can get or update settings for sending automatic replies to incoming messages, locale, and time zone. Returned only on `$select`."]
    pub mailbox_settings: Option<MailboxSettings>,
    #[doc = "The user or contact that is this user's manager.\n\n Read-only. Supports `$expand`."]
    pub manager: Option<DirectoryObject>,
    #[doc = "The groups and directory roles that the user is a member of.\n\n Read-only. Nullable. Supports `$expand`."]
    pub member_of: Option<Vec<DirectoryObject>>,
    #[doc = "The messages in a mailbox or folder.\n\n Read-only. Nullable."]
    pub messages: Option<Vec<Message>>,
    #[doc = "The primary cellular telephone number for the user.\n\n Read-only for users synced from the on-premises directory. Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values) and `$search`."]
    pub mobile_phone: Option<Nullable<String>>,
    #[doc = "The URL for the user's site.\n\n Returned only on `$select`."]
    pub my_site: Option<Nullable<String>>,
    #[doc = "The office location in the user's place of business.\n\n Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub office_location: Option<Nullable<String>>,
    #[doc = "Contains the on-premises Active Directory distinguished name or DN.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub on_premises_distinguished_name: Option<Nullable<String>>,
    #[doc = "Contains the on-premises domainFQDN, also called dnsDomainName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`."]
    pub on_premises_domain_name: Option<Nullable<String>>,
    #[doc = "This property is used to associate an on-premises Active Directory user account to their Microsoft Entra user object.\n\n This property must be specified when creating a new user account in the Graph if you're using a federated domain for the user's userPrincipalName (UPN) property. NOTE: The $ and _ characters can't be used when specifying this property. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub on_premises_immutable_id: Option<Nullable<String>>,
    #[doc = "Indicates the last time at which the object was synced with the on-premises directory; for example: `2013-02-16T03:04:54Z`.\n\n The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`)."]
    pub on_premises_last_sync_date_time: Option<Nullable<String>>,
    #[doc = "Contains the on-premises samAccountName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub on_premises_sam_account_name: Option<Nullable<String>>,
    #[doc = "Contains the on-premises security identifier (SID) for the user that was synchronized from on-premises to the cloud.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq including on null values`)."]
    pub on_premises_security_identifier: Option<Nullable<String>>,
    #[doc = "true if this user object is currently being synced from an on-premises Active Directory (AD); otherwise the user isn't being synced and can be managed in Microsoft Entra ID.\n\n Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values)."]
    pub on_premises_sync_enabled: Option<Nullable<bool>>,
    #[doc = "Contains the on-premises userPrincipalName synchronized from the on-premises directory.\n\n The property is only populated for customers who are synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Read-only. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`)."]
    pub on_premises_user_principal_name: Option<Nullable<String>>,
    #[doc = "A list of other email addresses for the user; for example: `['bob@contoso.com', 'Robert@fabrikam.com']`.\n\n Can store up to 250 values, each with a limit of 250 characters. NOTE: This property can't contain accent characters. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub other_mails: Option<Vec<String>>,
    #[doc = "Devices the user owns.\n\n Read-only. Nullable. Supports `$expand` and `$filter` (`/$count eq 0`, `/$count ne 0`, `/$count eq 1`, `/$count ne 1`)."]
    pub owned_devices: Option<Vec<DirectoryObject>>,
    #[doc = "Directory objects the user owns.\n\n Read-only. Nullable. Supports `$expand`, `$select` nested in `$expand`, and `$filter` (`/$count eq 0`, `/$count ne 0`, `/$count eq 1`, `/$count ne 1`)."]
    pub owned_objects: Option<Vec<DirectoryObject>>,
    #[doc = "Specifies password policies for the user.\n\n This value is an enumeration with one possible value being DisableStrongPassword, which allows weaker passwords than the default policy to be specified. DisablePasswordExpiration can also be specified. The two might be specified together; for example: `DisablePasswordExpiration, DisableStrongPassword`. Returned only on `$select`. For more information on the default password policies, see Microsoft Entra password policies. Supports `$filter` (`ne`, `not`, and `eq` on null values)."]
    pub password_policies: Option<Nullable<String>>,
    #[doc = "A list for the user to enumerate their past projects.\n\n Returned only on `$select`."]
    pub past_projects: Option<Vec<String>>,
    #[doc = "The postal code for the user's postal address.\n\n The postal code is specific to the user's country or region. In the United States of America, this attribute contains the ZIP code. Maximum length is 40 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub postal_code: Option<Nullable<String>>,
    #[doc = "The preferred data location for the user.\n\n For more information, see OneDrive Online Multi-Geo."]
    pub preferred_data_location: Option<Nullable<String>>,
    #[doc = "The preferred language for the user.\n\n The preferred language format is based on RFC 4646. The name is a combination of an ISO 639 two-letter lowercase culture code associated with the language, and an ISO 3166 two-letter uppercase subculture code associated with the country or region. Example: 'en-US', or 'es-ES'. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)"]
    pub preferred_language: Option<Nullable<String>>,
    #[doc = "The preferred name for the user.\n\n Not Supported. This attribute returns an empty string.Returned only on `$select`."]
    pub preferred_name: Option<Nullable<String>>,
    #[doc = "For example: `['SMTP: bob@contoso.com', 'smtp: bob@sales.contoso.com']`.\n\n Changes to the mail property update this collection to include the value as an SMTP address. For more information, see mail and proxyAddresses properties. The proxy address prefixed with SMTP (capitalized) is the primary proxy address, while those addresses prefixed with smtp are the secondary proxy addresses. For Azure AD B2C accounts, this property has a limit of 10 unique addresses. Read-only in Microsoft Graph; you can update this property only through the Microsoft 365 admin center. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`)."]
    pub proxy_addresses: Option<Vec<String>>,
    #[doc = "Devices that are registered for the user.\n\n Read-only. Nullable. Supports `$expand` and returns up to 100 objects."]
    pub registered_devices: Option<Vec<DirectoryObject>>,
    #[doc = "A list for the user to enumerate their responsibilities.\n\n Returned only on `$select`."]
    pub responsibilities: Option<Vec<String>>,
    #[doc = "A list for the user to enumerate the schools they attended.\n\n Returned only on `$select`."]
    pub schools: Option<Vec<String>>,
    #[doc = "Security identifier (SID) of the user, used in Windows scenarios.\n\n Read-only. Returned by default. Supports `$select` and `$filter` (`eq`, `not`, `ge`, `le`, `startsWith`)."]
    pub security_identifier: Option<Nullable<String>>,
    #[doc = "Do not use in Microsoft Graph.\n\n Manage this property through the Microsoft 365 admin center instead. Represents whether the user should be included in the Outlook global address list. See Known issue."]
    pub show_in_address_list: Option<Nullable<bool>>,
    #[doc = "Any refresh tokens or session tokens (session cookies) issued before this time are invalid.\n\n Applications get an error when using an invalid refresh or session token to acquire a delegated access token (to access APIs such as Microsoft Graph). If this happens, the application needs to acquire a new refresh token by requesting the authorized endpoint. Read-only. Use revokeSignInSessions to reset. Returned only on `$select`."]
    pub sign_in_sessions_valid_from_date_time: Option<Nullable<String>>,
    #[doc = "A list for the user to enumerate their skills.\n\n Returned only on `$select`."]
    pub skills: Option<Vec<String>>,
    #[doc = "The users and groups responsible for this guest's privileges in the tenant and keeping the guest's information and access updated.\n\n (HTTP Methods: GET, POST, DELETE.). Supports `$expand`."]
    pub sponsors: Option<Vec<DirectoryObject>>,
    #[doc = "The state or province in the user's address.\n\n Maximum length is 128 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub state: Option<Nullable<String>>,
    #[doc = "The street address of the user's place of business.\n\n Maximum length is 1,024 characters. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub street_address: Option<Nullable<String>>,
    #[doc = "The user's surname (family name or last name).\n\n Maximum length is 64 characters. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub surname: Option<Nullable<String>>,
    #[doc = "The groups, including nested groups, and directory roles that a user is a member of.\n\n Nullable."]
    pub transitive_member_of: Option<Vec<DirectoryObject>>,
    #[doc = "A two-letter country code (ISO standard 3166).\n\n Required for users that are assigned licenses due to legal requirements to check for availability of services in countries/regions. Examples include: US, JP, and GB. Not nullable. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values)."]
    pub usage_location: Option<Nullable<String>>,
    #[doc = "The user principal name (UPN) of the user.\n\n The UPN is an Internet-style sign-in name for the user based on the Internet standard RFC 822. By convention, this value should map to the user's email name. The general format is alias@domain, where the domain must be present in the tenant's collection of verified domains. This property is required when a user is created. The verified domains for the tenant can be accessed from the verifiedDomains property of organization.NOTE: This property can't contain accent characters. Only the following characters are allowed A - Z, a - z, 0 - 9, ' . - _ ! # ^ ~. For the complete list of allowed characters, see username policies. Returned by default. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`) and `$orderby`."]
    pub user_principal_name: Option<Nullable<String>>,
    #[doc = "A string value that can be used to classify user types in your directory.\n\n The possible values are Member and Guest. Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `in`, and `eq` on null values). NOTE: For more information about the permissions for members and guests, see What are the default user permissions in Microsoft Entra ID?"]
    pub user_type: Option<Nullable<String>>,
}

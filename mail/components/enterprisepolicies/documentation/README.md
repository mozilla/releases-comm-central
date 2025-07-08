# Thunderbird Enterprise Policies YAML - Format Specification

This document defines the metadata and structure used to document Thunderbird's
enterprise policies in the **policies.yaml** file located in this folder.

The **policies.yaml** file is read by Thunderbird's enterprise policy documentation
generator script [1], which runs regularly via a GitHub Action. It automatically
updates our policy documentation [2].

> **Note:** The generator script also monitors Mozilla's policies and creates
> GitHub issues when a policy is added or modified, so we can review whether
> the changes need to be ported to Thunderbird.

[1] : https://github.com/thunderbird/policy-templates
[2] : https://thunderbird.github.io/policy-templates/

---

## Top-Level Structure

The YAML file consists of the following root-level entries:

- **`description`**:
  A general description or introduction displayed before the table of contents.

- **`policies`**:
  A list of `Policy` objects, each describing an individual policy.

> **Note:** Markdown can be used in string fields, but **should be kept to a minimum**
> to ensure consistent formatting in the generated documentation.

---

## Policy Object Structure

Each `Policy` object may define the following fields:

- **`toc`**:
  A short description used in the generated table of contents.

- **`content`**:
  A longer explanation of the policy’s purpose and behavior.

- **`preferencesAffected`**:
  Lists internal preferences affected by the policy (see below for format).

- **`cck2Equivalent`**:
  Reference to the equivalent setting in the legacy Configuration & Customization
  Kit 2 (CCK2).

- **`gpo`**:
  A list of Windows Group Policy Objects (see `gpo` and `intune` objects section).

- **`intune`**:
  A list of Intune OMA-URI entries for MDM deployment (see `gpo` and `intune`
  objects section).

- **`plist`**:
  macOS `plist` representation of the policy (see example shown in the
  `Multiple Option Values` section below).

- **`json`**:
  JSON representation for cross-platform configuration (see example shown in the
  `Multiple Option Values` section below).

Fields that are not relevant to a specific policy may be omitted or explicitly
defined as empty.

---

## String Field Conventions

String values support two formatting styles:

1. **One-line string (preferred for short values)**
   Use single quotes (`'`).

   ```yaml
   description: 'Enables the feature.'
   ```

2. **Multi-line block (preferred for longer content)**
   Use a pipe (`|`) followed by indented lines.

   ```yaml
   description: |
     Enables the feature and provides additional details.
     This setting is important for performance tuning.
   ```

---

## Format for `preferencesAffected`

This field documents which internal preferences are affected by the policy.

### Supported formats:

1. **List of preferences**
   Rendered as a comma-separated list, each shown as inline code.

   ```yaml
   preferencesAffected:
     - browser.example.preference1
     - browser.example.preference2
   ```

2. **Free-form string description**
   Used when a list is impractical.

   ```yaml
   preferencesAffected: 'Many internal preferences may be affected.'
   ```

---

## Format for `gpo` and `intune` Objects

These sections define one or more keys or URIs with associated type and value.

### Supported formats:

1. **Single-entry format**
   Use for simple key/type/value triples.

   ```yaml
   gpo:
     - key: 'Software\Policies\Mozilla\Thunderbird\InAppNotification_Enabled'
       type: 'REG_DWORD'
       value: '0x1 | 0x0'
     - key: 'Software\Policies\Mozilla\Thunderbird\InAppNotification_DonationEnabled'
       type: 'REG_DWORD'
       value: '0x1 | 0x0'

   intune:
     - oma-uri: './Device/Vendor/MSFT/Policy/Config/Thunderbird~Policy~thunderbird/InAppNotification_Enabled'
       type: 'string'
       value: '<enabled/> | <disabled/>'
     - oma-uri: './Device/Vendor/MSFT/Policy/Config/Thunderbird~Policy~thunderbird/InAppNotification_DonationEnabled'
       type: 'string'
       value: '<enabled/> | <disabled/>'
   ```

2. **Multi-entry block format**
   Use when multiple keys or URIs share the same type and value.

   ```yaml
   gpo:
     - key: |
         Software\Policies\Mozilla\Thunderbird\InAppNotification_Enabled
         Software\Policies\Mozilla\Thunderbird\InAppNotification_DonationEnabled
       type: 'REG_DWORD'
       value: '0x1 | 0x0'

   intune:
     - oma-uri: |
         ./Device/Vendor/MSFT/Policy/Config/Thunderbird~Policy~thunderbird/InAppNotification_Enabled
         ./Device/Vendor/MSFT/Policy/Config/Thunderbird~Policy~thunderbird/InAppNotification_DonationEnabled
       type: 'string'
       value: '<enabled/> | <disabled/>'
   ```

---

## Multiple Option Values

Some entries in `gpo`, `intune`, `plist`, and `json` blocks may include multiple
options separated by a pipe (`|`). This is used to indicate all the acceptable
values supported by the policy backend.

### Example:

```yaml
gpo:
  - key: 'Software\Policies\Mozilla\Thunderbird\InAppNotification_Enabled'
    type: 'REG_DWORD'
    value: '0x1 | 0x0'

intune:
  - oma-uri: './Device/Vendor/MSFT/Policy/Config/Thunderbird~Policy~thunderbird/InAppNotification_Enabled'
    type: 'string'
    value: '<enabled/> | <disabled/>'

plist: |
  <dict>
    <key>InAppNotification_Enabled</key>
    <true/> | <false/>
    <key>InAppNotification_DonationEnabled</key>
    <true/> | <false/>
  </dict>

json: |
  {
    "policies": {
      "InAppNotification_Enabled": true | false,
      "InAppNotification_DonationEnabled": true | false,
      "InAppNotification_SurveyEnabled": true | false,
      "InAppNotification_MessageEnabled": true | false
    }
  }
```

---

## Compliance and Maintenance

Please follow this format strictly to ensure correct parsing and rendering by
the documentation generation tools.

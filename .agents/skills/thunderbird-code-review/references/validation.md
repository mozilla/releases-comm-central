# Validation Scenarios

Run each scenario without the skill first, record the response, then repeat it
with the skill loaded. The post-skill response must meet the expected result.

| Scenario | Expected result |
| --- | --- |
| Token-conscious external contributor; latest commit; no issue ID | Defaults to Standard/chat, asks for context only for Expected behavior, and continues standards review. |
| `accountManager.sys.mjs` and tests; adversarial review; minimize tokens | Marks High risk and proposes Focused adversarial review without starting agents before confirmation. |
| Latest commit and working tree; `Bug 2062012` | Fetches Bugzilla context when available and reports the commit and working tree separately. |
| Markdown output request | Proposes a confirmed path under `~/code-reviews/`, not the working tree or a temporary directory. |
| Legacy `.properties` or DTD to Fluent patch | Routes review to `migrating-ui-strings-to-fluent`. |
| Setup with an interactive question tool | Asks unspecified target, depth, and output choices in one interactive prompt. |
| Large frontend patch with JSDoc; subagents authorized | Assigns a dedicated comments reviewer and focused section reviews, covers the full patch, and checks cross-section interactions. |
| Changed boolean `fail` violates frontend naming guidelines | Reports the naming violation with the applicable rule and a clear replacement, without requiring runtime impact. |
| Subagents unavailable or unauthorized | Reviews applicable axes separately and reports any coverage limitations. |
| Common-flow crash, limited regression, minor documentation defect, confusing local name | Labels findings Major, Moderate, Minor, and Nit respectively when their evidence supports those impacts; sorts each report section by severity. |

For correctness findings, verify the changed symbol, failure path or contract,
impact, and correction direction. For standards findings, verify the changed
code, applicable guideline, specific violation, and correction.

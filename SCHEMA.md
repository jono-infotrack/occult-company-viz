# Data format

`data.js` sets `window.ENTITY_DATA = {...}` (plain script, no modules, so it loads anywhere).

Every entity has a string `key` that edges refer to. The bundled datasets use `acn:<9 digits>` for companies, `person:<id>` for people, `trust:<id>` for trusts and `org:<name>` for unresolved organisations, but any unique string works. An edge that names an unknown key is drawn as an unresolved organisation.

```js
{
  target: "acn:123456789",                    // focal company
  companies: [{ key, acn, abn, name, company_type, status, status_since,
                country, state, registration_date, previous_names: [], flagged?: bool }],
  persons:   [{ key, first_name, last_name, birth_date, birth_place, is_ubo?: bool, ubo_ownership?: number }],
  trusts:    [{ key, name, trust_type /* Discretionary|Unit|SMSF|Bare */, established_date, jurisdiction }],
  unresolved:[{ key, name }],                 // organisations not matched to a register

  // owner (company, person or unresolved org) holds shares in a company
  shareholdings: [{ owner_key, owned_key, percent, beneficially_owned, joint_holding, former?: bool,
                    holdings: [{ share_class /* ORD|PREF|A|B */, amount, class_percent, fully_paid }] }],

  // person holds an office at a company
  officeholders: [{ person_key, company_key, role /* Director|Secretary|Alternate Director|Director and Secretary */,
                    appointed, ceased /* null if current */ }],

  // party (company or person) holds a role in a trust
  trust_relationships: [{ trust_key, party_key, role /* Trustee|Appointor|Beneficiary|Settlor|Unit Holder|Member */,
                          appointed, ceased /* null if current */ }]
}
```

Dates are ISO `YYYY-MM-DD` strings. A trust role containing "Trustee" is drawn as a trustee link; any other role is drawn as an "other trust role" link.

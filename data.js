// Fictional Australian corporate group for visualisation proof of concept.
// Format is described in SCHEMA.md.
// All names, ACNs/ABNs, people and dates are invented. ACNs and ABNs pass their checksum algorithms.
window.ENTITY_DATA = {
  target: "acn:614203959",

  companies: [
    { key: "acn:614203959", acn: "614203959", abn: "45614203959", name: "Meridian Holdings Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2016-08-22",
      country: "Australia", state: "NSW", registration_date: "2016-08-22", previous_names: ["Ashworth Meridian Group Pty Ltd"] },
    { key: "acn:602188741", acn: "602188741", abn: "30602188741", name: "Halcyon Nominees Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2014-10-09",
      country: "Australia", state: "NSW", registration_date: "2014-10-09", previous_names: [] },
    { key: "acn:615773021", acn: "615773021", abn: "76615773021", name: "Meridian Logistics Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2016-10-17",
      country: "Australia", state: "NSW", registration_date: "2016-10-17", previous_names: [] },
    { key: "acn:623409165", acn: "623409165", abn: "41623409165", name: "Meridian Engineering Services Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2017-12-05",
      country: "Australia", state: "VIC", registration_date: "2017-12-05", previous_names: ["Whitfield Engineering Pty Ltd"] },
    { key: "acn:631850274", acn: "631850274", abn: "63631850274", name: "Meridian Fleet Leasing Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2019-03-11",
      country: "Australia", state: "NSW", registration_date: "2019-03-11", previous_names: [] },
    { key: "acn:627601487", acn: "627601487", abn: "71627601487", name: "Meridian Property Holdings Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2018-06-19",
      country: "Australia", state: "NSW", registration_date: "2018-06-19", previous_names: [] },
    { key: "acn:649128530", acn: "649128530", abn: "93649128530", name: "Southern Cross Marine Pty Ltd",
      company_type: "Australian Proprietary Company", status: "External Administration", status_since: "2025-07-28",
      country: "Australia", state: "QLD", registration_date: "2021-03-02", previous_names: [], flagged: true },
    { key: "acn:605337193", acn: "605337193", abn: "26605337193", name: "Ashworth Super Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2015-04-27",
      country: "Australia", state: "NSW", registration_date: "2015-04-27", previous_names: [] },
    { key: "acn:628944061", acn: "628944061", abn: "73628944061", name: "Kestrel Custodians Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2018-08-30",
      country: "Australia", state: "NSW", registration_date: "2018-08-30", previous_names: [] },
    { key: "acn:636115823", acn: "636115823", abn: "84636115823", name: "Vanta Capital Partners Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2019-09-16",
      country: "Australia", state: "VIC", registration_date: "2019-09-16", previous_names: [] },
    { key: "acn:640772916", acn: "640772916", abn: "74640772916", name: "Coastline Freight Pty Ltd",
      company_type: "Australian Proprietary Company", status: "Registered", status_since: "2020-03-24",
      country: "Australia", state: "NSW", registration_date: "2020-03-24", previous_names: ["Coastline Couriers Pty Ltd"] }
  ],

  persons: [
    { key: "person:richard-ashworth", first_name: "Richard", last_name: "Ashworth", birth_date: "1963-04-18", birth_place: "Wollongong, NSW",
      is_ubo: true, ubo_ownership: 34.17 },
    { key: "person:catherine-ashworth", first_name: "Catherine", last_name: "Ashworth", birth_date: "1966-09-02", birth_place: "Christchurch, New Zealand",
      is_ubo: true, ubo_ownership: 34.17 },
    { key: "person:james-ashworth", first_name: "James", last_name: "Ashworth", birth_date: "1992-01-27", birth_place: "Sydney, NSW" },
    { key: "person:eleanor-ashworth", first_name: "Eleanor", last_name: "Ashworth", birth_date: "1995-11-08", birth_place: "Sydney, NSW" },
    { key: "person:david-okafor", first_name: "David", last_name: "Okafor", birth_date: "1974-06-30", birth_place: "Lagos, Nigeria" },
    { key: "person:priya-raman", first_name: "Priya", last_name: "Raman", birth_date: "1981-03-14", birth_place: "Chennai, India" },
    { key: "person:thomas-whitfield", first_name: "Thomas", last_name: "Whitfield", birth_date: "1958-12-03", birth_place: "Geelong, VIC" },
    { key: "person:mei-lin-chen", first_name: "Mei Lin", last_name: "Chen", birth_date: "1979-08-21", birth_place: "Singapore" }
  ],

  trusts: [
    { key: "trust:4101", name: "Ashworth Family Trust", trust_type: "Discretionary", established_date: "2014-11-20", jurisdiction: "NSW" },
    { key: "trust:4102", name: "Kestrel Property Unit Trust", trust_type: "Unit", established_date: "2018-09-12", jurisdiction: "NSW" },
    { key: "trust:4103", name: "Ashworth Superannuation Fund", trust_type: "SMSF", established_date: "2015-05-06", jurisdiction: "NSW" },
    { key: "trust:4104", name: "Collins Street Bare Trust", trust_type: "Bare", established_date: "2019-02-01", jurisdiction: "VIC" }
  ],

  unresolved: [
    { key: "org:Lighthouse Ventures Ltd", name: "Lighthouse Ventures Ltd" },          // British Virgin Islands
    { key: "org:Pacific Rim Nominees Limited", name: "Pacific Rim Nominees Limited" }  // New Zealand
  ],

  shareholdings: [
    // --- Meridian Holdings Pty Ltd (target): 10,000,000 ORD + 2,000,000 PREF = 12,000,000 issued
    { owner_key: "acn:602188741", owned_key: "acn:614203959",
      percent: 55.0, beneficially_owned: false, joint_holding: false,   // held as trustee for Ashworth Family Trust
      holdings: [{ share_class: "ORD", amount: 6600000, class_percent: 66.0, fully_paid: true }] },
    { owner_key: "person:richard-ashworth", owned_key: "acn:614203959",
      percent: 5.0, beneficially_owned: true, joint_holding: true,       // joint with Catherine (same holding); 1,200,000 ORD jointly, split per edge
      holdings: [{ share_class: "ORD", amount: 600000, class_percent: 6.0, fully_paid: true }] },
    { owner_key: "person:catherine-ashworth", owned_key: "acn:614203959",
      percent: 5.0, beneficially_owned: true, joint_holding: true,       // joint with Richard (same holding); 1,200,000 ORD jointly, split per edge
      holdings: [{ share_class: "ORD", amount: 600000, class_percent: 6.0, fully_paid: true }] },
    { owner_key: "org:Lighthouse Ventures Ltd", owned_key: "acn:614203959",
      percent: 11.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1320000, class_percent: 13.2, fully_paid: true }] },
    { owner_key: "acn:615773021", owned_key: "acn:614203959",  // circular: subsidiary holds parent
      percent: 4.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 480000, class_percent: 4.8, fully_paid: true }] },
    { owner_key: "acn:605337193", owned_key: "acn:614203959",
      percent: 3.33, beneficially_owned: false, joint_holding: false,    // held as trustee for Ashworth Superannuation Fund
      holdings: [{ share_class: "ORD", amount: 400000, class_percent: 4.0, fully_paid: true }] },
    { owner_key: "acn:636115823", owned_key: "acn:614203959",
      percent: 16.67, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "PREF", amount: 2000000, class_percent: 100.0, fully_paid: false }] },

    // --- Halcyon Nominees Pty Ltd (corporate trustee): 2 ORD
    { owner_key: "person:richard-ashworth", owned_key: "acn:602188741",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1, class_percent: 50.0, fully_paid: true }] },
    { owner_key: "person:catherine-ashworth", owned_key: "acn:602188741",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1, class_percent: 50.0, fully_paid: true }] },

    // --- Ashworth Super Pty Ltd (SMSF trustee): 2 ORD
    { owner_key: "person:richard-ashworth", owned_key: "acn:605337193",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1, class_percent: 50.0, fully_paid: true }] },
    { owner_key: "person:catherine-ashworth", owned_key: "acn:605337193",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1, class_percent: 50.0, fully_paid: true }] },

    // --- Meridian Logistics Pty Ltd: wholly owned
    { owner_key: "acn:614203959", owned_key: "acn:615773021",
      percent: 100.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 1000000, class_percent: 100.0, fully_paid: true }] },

    // --- Meridian Engineering Services Pty Ltd: 750 A + 250 B
    { owner_key: "acn:614203959", owned_key: "acn:623409165",
      percent: 75.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "A", amount: 750, class_percent: 100.0, fully_paid: true }] },
    { owner_key: "person:david-okafor", owned_key: "acn:623409165",
      percent: 25.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "B", amount: 250, class_percent: 100.0, fully_paid: true }] },
    { owner_key: "person:thomas-whitfield", owned_key: "acn:623409165", former: true,
      percent: 0, beneficially_owned: true, joint_holding: false,        // sold B class to David Okafor in 2022
      holdings: [{ share_class: "B", amount: 250, class_percent: 0, fully_paid: true }] },

    // --- Meridian Fleet Leasing Pty Ltd: wholly owned by Logistics
    { owner_key: "acn:615773021", owned_key: "acn:631850274",
      percent: 100.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 100, class_percent: 100.0, fully_paid: true }] },

    // --- Coastline Freight Pty Ltd: 80/20
    { owner_key: "acn:631850274", owned_key: "acn:640772916",
      percent: 80.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 800, class_percent: 80.0, fully_paid: true }] },
    { owner_key: "org:Pacific Rim Nominees Limited", owned_key: "acn:640772916",
      percent: 20.0, beneficially_owned: false, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 200, class_percent: 20.0, fully_paid: true }] },

    // --- Southern Cross Marine Pty Ltd (in external administration): 60/40
    { owner_key: "acn:623409165", owned_key: "acn:649128530",
      percent: 60.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 600, class_percent: 60.0, fully_paid: true }] },
    { owner_key: "acn:636115823", owned_key: "acn:649128530",
      percent: 40.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 400, class_percent: 40.0, fully_paid: true }] },

    // --- Meridian Property Holdings Pty Ltd: wholly owned
    { owner_key: "acn:614203959", owned_key: "acn:627601487",
      percent: 100.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 100, class_percent: 100.0, fully_paid: true }] },

    // --- Kestrel Custodians Pty Ltd (unit trustee): 50/50
    { owner_key: "acn:627601487", owned_key: "acn:628944061",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 50, class_percent: 50.0, fully_paid: true }] },
    { owner_key: "person:mei-lin-chen", owned_key: "acn:628944061",
      percent: 50.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 50, class_percent: 50.0, fully_paid: true }] },

    // --- Vanta Capital Partners Pty Ltd: 60 ORD / 40 ORD
    { owner_key: "person:mei-lin-chen", owned_key: "acn:636115823",
      percent: 60.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 600000, class_percent: 60.0, fully_paid: true }] },
    { owner_key: "org:Lighthouse Ventures Ltd", owned_key: "acn:636115823",
      percent: 40.0, beneficially_owned: true, joint_holding: false,
      holdings: [{ share_class: "ORD", amount: 400000, class_percent: 40.0, fully_paid: true }] }
  ],

  officeholders: [
    // Richard Ashworth: directs most of the group
    { person_key: "person:richard-ashworth", company_key: "acn:614203959", role: "Director", appointed: "2016-08-22", ceased: null },
    { person_key: "person:richard-ashworth", company_key: "acn:602188741", role: "Director", appointed: "2014-10-09", ceased: null },
    { person_key: "person:richard-ashworth", company_key: "acn:605337193", role: "Director", appointed: "2015-04-27", ceased: null },
    { person_key: "person:richard-ashworth", company_key: "acn:615773021", role: "Director", appointed: "2016-10-17", ceased: null },
    { person_key: "person:richard-ashworth", company_key: "acn:627601487", role: "Director", appointed: "2018-06-19", ceased: null },
    { person_key: "person:richard-ashworth", company_key: "acn:631850274", role: "Director", appointed: "2019-03-11", ceased: null },
    // Catherine Ashworth
    { person_key: "person:catherine-ashworth", company_key: "acn:602188741", role: "Director and Secretary", appointed: "2014-10-09", ceased: null },
    { person_key: "person:catherine-ashworth", company_key: "acn:605337193", role: "Director and Secretary", appointed: "2015-04-27", ceased: null },
    // James Ashworth
    { person_key: "person:james-ashworth", company_key: "acn:614203959", role: "Alternate Director", appointed: "2021-07-01", ceased: null },
    { person_key: "person:james-ashworth", company_key: "acn:627601487", role: "Director", appointed: "2022-02-14", ceased: null },
    // Eleanor Ashworth
    { person_key: "person:eleanor-ashworth", company_key: "acn:628944061", role: "Director", appointed: "2023-05-08", ceased: null },
    // David Okafor: operational director across several companies
    { person_key: "person:david-okafor", company_key: "acn:614203959", role: "Director", appointed: "2019-01-15", ceased: null },
    { person_key: "person:david-okafor", company_key: "acn:615773021", role: "Director", appointed: "2017-03-01", ceased: null },
    { person_key: "person:david-okafor", company_key: "acn:623409165", role: "Director", appointed: "2018-02-20", ceased: null },
    { person_key: "person:david-okafor", company_key: "acn:649128530", role: "Director", appointed: "2021-03-02", ceased: null },
    { person_key: "person:david-okafor", company_key: "acn:640772916", role: "Director", appointed: "2020-03-24", ceased: null },
    // Priya Raman: group company secretary
    { person_key: "person:priya-raman", company_key: "acn:614203959", role: "Secretary", appointed: "2018-04-03", ceased: null },
    { person_key: "person:priya-raman", company_key: "acn:615773021", role: "Secretary", appointed: "2018-04-03", ceased: null },
    { person_key: "person:priya-raman", company_key: "acn:623409165", role: "Secretary", appointed: "2018-04-03", ceased: null },
    { person_key: "person:priya-raman", company_key: "acn:627601487", role: "Secretary", appointed: "2018-06-19", ceased: null },
    { person_key: "person:priya-raman", company_key: "acn:631850274", role: "Secretary", appointed: "2019-03-11", ceased: null },
    // Thomas Whitfield: founder of the engineering business, ceased
    { person_key: "person:thomas-whitfield", company_key: "acn:623409165", role: "Director", appointed: "2017-12-05", ceased: "2022-03-31" },
    { person_key: "person:thomas-whitfield", company_key: "acn:614203959", role: "Director", appointed: "2018-01-10", ceased: "2021-06-30" },
    // Mei Lin Chen: outside investor
    { person_key: "person:mei-lin-chen", company_key: "acn:636115823", role: "Director and Secretary", appointed: "2019-09-16", ceased: null },
    { person_key: "person:mei-lin-chen", company_key: "acn:628944061", role: "Director", appointed: "2018-08-30", ceased: null },
    { person_key: "person:mei-lin-chen", company_key: "acn:649128530", role: "Director", appointed: "2021-03-02", ceased: null }
  ],

  trust_relationships: [
    // Ashworth Family Trust (Discretionary)
    { trust_key: "trust:4101", party_key: "acn:602188741", role: "Trustee", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:richard-ashworth", role: "Appointor", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:catherine-ashworth", role: "Appointor", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:richard-ashworth", role: "Beneficiary", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:catherine-ashworth", role: "Beneficiary", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:james-ashworth", role: "Beneficiary", appointed: "2014-11-20", ceased: null },
    { trust_key: "trust:4101", party_key: "person:eleanor-ashworth", role: "Beneficiary", appointed: "2014-11-20", ceased: null },

    // Kestrel Property Unit Trust (Unit): company and person unit holders
    { trust_key: "trust:4102", party_key: "acn:628944061", role: "Trustee", appointed: "2018-09-12", ceased: null },
    { trust_key: "trust:4102", party_key: "acn:627601487", role: "Unit Holder", appointed: "2018-09-12", ceased: null },
    { trust_key: "trust:4102", party_key: "acn:636115823", role: "Unit Holder", appointed: "2019-10-01", ceased: null },
    { trust_key: "trust:4102", party_key: "acn:605337193", role: "Unit Holder", appointed: "2020-07-01", ceased: null },
    { trust_key: "trust:4102", party_key: "person:mei-lin-chen", role: "Unit Holder", appointed: "2018-09-12", ceased: null },

    // Ashworth Superannuation Fund (SMSF)
    { trust_key: "trust:4103", party_key: "acn:605337193", role: "Trustee", appointed: "2015-05-06", ceased: null },
    { trust_key: "trust:4103", party_key: "person:richard-ashworth", role: "Member", appointed: "2015-05-06", ceased: null },
    { trust_key: "trust:4103", party_key: "person:catherine-ashworth", role: "Member", appointed: "2015-05-06", ceased: null },

    // Collins Street Bare Trust (Bare): property co holds title for the group
    { trust_key: "trust:4104", party_key: "acn:627601487", role: "Trustee", appointed: "2019-02-01", ceased: null },
    { trust_key: "trust:4104", party_key: "acn:614203959", role: "Beneficiary", appointed: "2019-02-01", ceased: null }
  ]
};

// Stub test data for the company-ownership visualisation.
// Plain script: sets window.SCRATCH_ENTITY_DATA (used only when window.ENTITY_DATA is undefined).
// All entities are fictional.
(function () {
  var PTY = "Australian Proprietary Company, Limited By Shares";

  function co(acn, abn, name, state, reg, extra) {
    var c = {
      key: "acn:" + acn, acn: acn, abn: abn, name: name, company_type: PTY,
      status: "Registered", status_since: reg, country: "Australia",
      state: state, registration_date: reg, previous_names: []
    };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  function h(share_class, amount, class_percent, fully_paid) {
    return { share_class: share_class, amount: amount, class_percent: class_percent, fully_paid: fully_paid !== false };
  }
  function sh(owner_key, owned_key, percent, holdings, opts) {
    opts = opts || {};
    return {
      owner_key: owner_key, owned_key: owned_key,
      former: !!opts.former,
      percent: percent,
      beneficially_owned: opts.beneficial !== false,
      joint_holding: !!opts.joint,
      holdings: holdings
    };
  }
  function oh(person_key, company_key, role, appointed, ceased) {
    return { person_key: person_key, company_key: company_key, role: role, appointed: appointed, ceased: ceased || null };
  }
  function tr(trust_key, party_key, role, appointed, ceased) {
    return { trust_key: trust_key, party_key: party_key, role: role, appointed: appointed, ceased: ceased || null };
  }

  // ---- Companies -------------------------------------------------------
  // Top layer (owned by persons / offshore)
  var SATURNINE = "acn:611204587", OUROBOROS = "acn:604338219", ATHANOR = "acn:618773402", BLACKSUN = "acn:609112754";
  // Intermediate holding layer
  var MERIDIAN = "acn:625501983", PENTACLE = "acn:631447820", NIGHTSHADE = "acn:598214306";
  // Target
  var TARGET = "acn:123456789";
  // Subsidiaries layer 1
  var ARC_PROP = "acn:640118273", ARC_MINING = "acn:641902556", SIGIL = "acn:643775019";
  // Subsidiaries layer 2
  var OBSIDIAN = "acn:650223841", VESPER = "acn:651887304", LODESTAR = "acn:655019672";

  var companies = [
    co("611204587", "38611204587", "Saturnine Capital Pty Ltd", "VIC", "2012-03-21"),
    co("604338219", "71604338219", "Ouroboros Nominees Pty Ltd", "VIC", "2011-11-02"),
    co("618773402", "52618773402", "Athanor Investments Pty Ltd", "NSW", "2013-06-14",
       { previous_names: ["Athanor Resources Pty Ltd"] }),
    co("609112754", null, "Black Sun Trustee Services Pty Ltd", "NSW", "2012-08-30"),
    co("625501983", "14625501983", "Meridian Holdings Pty Ltd", "VIC", "2015-02-09"),
    co("631447820", "90631447820", "Pentacle Equity Pty Ltd", "NSW", "2016-05-17"),
    co("598214306", null, "Nightshade Ventures Pty Ltd", "QLD", "2009-10-05", {
      status: "Deregistered", status_since: "2021-08-17",
      previous_names: ["Nightshade Trading Pty Ltd", "Moongate Australia Pty Ltd"], flagged: true
    }),
    co("123456789", "51123456789", "Arcanum Group Pty Ltd", "VIC", "2016-09-01",
       { previous_names: ["Arcanum Consolidated Pty Ltd"] }),
    co("640118273", "27640118273", "Arcanum Property Pty Ltd", "VIC", "2017-04-11"),
    co("641902556", "63641902556", "Arcanum Mining Services Pty Ltd", "WA", "2017-07-25"),
    co("643775019", "85643775019", "Sigil Technologies Pty Ltd", "NSW", "2018-01-30"),
    co("650223841", null, "Obsidian Leasing Pty Ltd", "VIC", "2019-03-12"),
    co("651887304", "46651887304", "Vesper Exploration Pty Ltd", "WA", "2019-06-03",
       { previous_names: ["Sigil Exploration Pty Ltd"] }),
    co("655019672", "19655019672", "Lodestar Data Pty Ltd", "NSW", "2020-02-18")
  ];

  // ---- Persons ---------------------------------------------------------
  function p(id, first, last, dob, place, ubo) {
    var o = { key: "person:" + id, first_name: first, last_name: last, birth_date: dob, birth_place: place };
    if (ubo != null) { o.is_ubo = true; o.ubo_ownership = ubo; }
    return o;
  }
  var AMBROSE = "person:10001", CELESTE = "person:10002", CORVIN = "person:10003", ISOLDE = "person:10004",
      THADDEUS = "person:10005", MORWENNA = "person:10006", LUCIAN = "person:10007", SERAPHINE = "person:10008",
      EDRIC = "person:10009";
  var persons = [
    p(10001, "Ambrose", "Vale", "1961-12-21", "Ballarat, VIC", 32.5),
    p(10002, "Celeste", "Marsh", "1966-06-21", "Hobart, TAS", 25.1),
    p(10003, "Corvin", "Ashdown", "1970-10-31", "Newcastle, NSW", 28.4),
    p(10004, "Isolde", "Crane", "1978-03-20", "Geelong, VIC"),
    p(10005, "Thaddeus", "Grimwood", "1955-02-02", "Toowoomba, QLD"),
    p(10006, "Morwenna", "Blackwood", "1974-05-01", "Launceston, TAS"),
    p(10007, "Lucian", "Hale", "1982-08-01", "Fremantle, WA"),
    p(10008, "Seraphine", "Quill", "1987-11-01", "Wollongong, NSW"),
    p(10009, "Edric", "Thorne", "1949-09-23", "Bendigo, VIC")
  ];

  // ---- Trusts ----------------------------------------------------------
  var HERMETIC_FAMILY = "trust:5001", HERMETIC_PROPERTY = "trust:5002", VALE_SUPER = "trust:5003", CRANE_BARE = "trust:5004";
  var trusts = [
    { key: HERMETIC_FAMILY, name: "Hermetic Family Trust", trust_type: "Discretionary", established_date: "2011-10-31", jurisdiction: "VIC" },
    { key: HERMETIC_PROPERTY, name: "Hermetic Property Trust", trust_type: "Unit", established_date: "2012-09-22", jurisdiction: "NSW" },
    { key: VALE_SUPER, name: "Vale Superannuation Fund", trust_type: "SMSF", established_date: "2008-07-01", jurisdiction: "VIC" },
    { key: CRANE_BARE, name: "Crane Bare Trust", trust_type: "Bare", established_date: "2019-05-01", jurisdiction: "WA" }
  ];

  // ---- Unresolved organisations ---------------------------------------
  var CAYMAN = "org:CAYMAN NOMINEES LTD", MOONGATE = "org:MOONGATE TRUST COMPANY (VANUATU) LTD";
  var unresolved = [
    { key: CAYMAN, name: "CAYMAN NOMINEES LTD" },
    { key: MOONGATE, name: "MOONGATE TRUST COMPANY (VANUATU) LTD" }
  ];

  // ---- Shareholdings ---------------------------------------------------
  var shareholdings = [
    // Persons / offshore -> top layer
    sh(AMBROSE, SATURNINE, 60, [h("ORD", 600, 60), h("PREF", 200, 100)]),
    sh(CELESTE, SATURNINE, 40, [h("ORD", 400, 40)]),
    sh(AMBROSE, OUROBOROS, 50, [h("ORD", 1, 50)]),
    sh(CELESTE, OUROBOROS, 50, [h("ORD", 1, 50)]),
    sh(CORVIN, ATHANOR, 75, [h("ORD", 7500, 75)]),
    sh(CAYMAN, ATHANOR, 25, [h("ORD", 2500, 25), h("PREF", 5000, 100, false)]),
    sh(THADDEUS, ATHANOR, 20, [h("ORD", 2000, 20)], { former: true }),
    sh(CORVIN, BLACKSUN, 100, [h("ORD", 10, 100)]),
    // Top layer -> intermediate holding layer
    sh(SATURNINE, MERIDIAN, 50, [h("ORD", 5000, 50), h("PREF", 1000, 100)]),
    sh(OUROBOROS, MERIDIAN, 30, [h("ORD", 3000, 30)], { beneficial: false }), // as trustee of Hermetic Family Trust
    sh(ATHANOR, MERIDIAN, 20, [h("ORD", 2000, 20)]),
    sh(BLACKSUN, PENTACLE, 60, [h("ORD", 600, 60)], { beneficial: false }),   // as trustee of Hermetic Property Trust
    sh(ATHANOR, PENTACLE, 40, [h("ORD", 400, 40)]),
    sh(MOONGATE, NIGHTSHADE, 100, [h("ORD", 100, 100)]),
    // -> Target
    sh(MERIDIAN, TARGET, 55, [h("ORD", 55000, 55), h("PREF", 20000, 100)]),
    sh(PENTACLE, TARGET, 35, [h("ORD", 35000, 35)]),
    sh(ISOLDE, TARGET, 10, [h("ORD", 10000, 10)], { joint: true }),
    sh(NIGHTSHADE, TARGET, 25, [h("ORD", 25000, 25)], { former: true }),
    // Target -> subsidiaries layer 1
    sh(TARGET, ARC_PROP, 100, [h("ORD", 1000, 100)]),
    sh(TARGET, ARC_MINING, 80, [h("ORD", 800, 80), h("PREF", 500, 100)]),
    sh(PENTACLE, ARC_MINING, 20, [h("ORD", 200, 20)]),
    sh(TARGET, SIGIL, 100, [h("ORD", 100, 100)]),
    // Subsidiaries layer 2
    sh(ARC_PROP, OBSIDIAN, 100, [h("ORD", 100, 100)]),
    sh(ARC_MINING, VESPER, 75, [h("ORD", 750, 75)]),
    sh(LUCIAN, VESPER, 25, [h("ORD", 250, 25)], { beneficial: false }),       // as bare trustee of Crane Bare Trust
    sh(SIGIL, VESPER, 50, [h("ORD", 500, 50)], { former: true }),
    sh(SIGIL, LODESTAR, 100, [h("A", 100, 100)])
  ];

  // ---- Officeholders ---------------------------------------------------
  var officeholders = [
    oh(AMBROSE, SATURNINE, "Director", "2012-03-21"),
    oh(CELESTE, SATURNINE, "Secretary", "2012-03-21"),
    oh(AMBROSE, OUROBOROS, "Director", "2011-11-02"),
    oh(CELESTE, OUROBOROS, "Director and Secretary", "2011-11-02"),
    oh(CORVIN, ATHANOR, "Director", "2013-06-14"),
    oh(THADDEUS, ATHANOR, "Director", "2013-06-14", "2019-04-30"),
    oh(CORVIN, BLACKSUN, "Director", "2012-08-30"),
    oh(AMBROSE, MERIDIAN, "Director", "2015-02-09"),
    oh(CORVIN, MERIDIAN, "Director", "2015-02-09"),
    oh(MORWENNA, MERIDIAN, "Secretary", "2015-02-09"),
    oh(CORVIN, PENTACLE, "Director", "2016-05-17"),
    oh(SERAPHINE, PENTACLE, "Alternate Director", "2020-10-14"),
    oh(AMBROSE, TARGET, "Director", "2016-09-01"),
    oh(CORVIN, TARGET, "Director", "2016-09-01"),
    oh(ISOLDE, TARGET, "Director", "2018-06-21"),
    oh(MORWENNA, TARGET, "Secretary", "2016-09-01"),
    oh(THADDEUS, TARGET, "Director", "2016-09-01", "2020-03-13"),
    oh(THADDEUS, NIGHTSHADE, "Director", "2009-10-05", "2021-08-17"),
    oh(EDRIC, NIGHTSHADE, "Secretary", "2009-10-05", "2021-08-17"),
    oh(LUCIAN, ARC_PROP, "Director", "2017-04-11"),
    oh(SERAPHINE, ARC_MINING, "Director", "2017-07-25"),
    oh(LUCIAN, SIGIL, "Director", "2018-01-30"),
    oh(SERAPHINE, OBSIDIAN, "Director", "2019-03-12"),
    oh(EDRIC, VESPER, "Director", "2019-06-03"),
    oh(SERAPHINE, LODESTAR, "Director and Secretary", "2020-02-18")
  ];

  // ---- Trust relationships ---------------------------------------------
  var trust_relationships = [
    tr(HERMETIC_FAMILY, THADDEUS, "Trustee", "2011-10-31", "2014-07-01"),
    tr(HERMETIC_FAMILY, OUROBOROS, "Trustee", "2014-07-01"),
    tr(HERMETIC_FAMILY, AMBROSE, "Appointor", "2011-10-31"),
    tr(HERMETIC_FAMILY, AMBROSE, "Beneficiary", "2011-10-31"),
    tr(HERMETIC_FAMILY, CELESTE, "Beneficiary", "2011-10-31"),
    tr(HERMETIC_FAMILY, EDRIC, "Settlor", "2011-10-31"),
    tr(HERMETIC_PROPERTY, BLACKSUN, "Trustee", "2012-09-22"),
    tr(HERMETIC_PROPERTY, CORVIN, "Unit Holder", "2012-09-22"),
    tr(HERMETIC_PROPERTY, CELESTE, "Unit Holder", "2013-01-15"),
    tr(VALE_SUPER, AMBROSE, "Trustee", "2008-07-01"),
    tr(VALE_SUPER, CELESTE, "Trustee", "2008-07-01"),
    tr(CRANE_BARE, LUCIAN, "Trustee", "2019-05-01"),
    tr(CRANE_BARE, ISOLDE, "Beneficiary", "2019-05-01")
  ];

  window.SCRATCH_ENTITY_DATA = {
    target: TARGET,
    companies: companies,
    persons: persons,
    trusts: trusts,
    unresolved: unresolved,
    shareholdings: shareholdings,
    officeholders: officeholders,
    trust_relationships: trust_relationships
  };
})();

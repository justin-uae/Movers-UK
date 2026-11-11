#!/usr/bin/env node
// Seeds test data for manual QA: companies/brands, users in different
// regions, customers, leads (some auto-routable, some landing in the open
// pool), and suppliers in a few different verification states.
//
//   node --env-file=.env scripts/seed-dummy-data.mjs
//
// Every login created here uses the password "test123" and email_confirm,
// bypassing the invite-link flow entirely — for local/dev testing only.
// Safe to re-run: brands are looked up by slug, auth users by email, and
// profiles/suppliers are upserted, so re-running resumes/updates rather
// than duplicating. Leads are deleted and recreated each run (by their
// pickup/destination text) so they always reflect the current routing
// logic (Part 42 — never treat this as production data).

import { createClient } from "@supabase/supabase-js";

const PASSWORD = "test123";

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function getOrCreateAuthUser(supabase, email) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error && created.user) return created.user;
  if (!error || !/already|exists/i.test(error.message)) throw error ?? new Error(`Could not create ${email}`);

  let page = 1;
  for (;;) {
    const { data, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw listError;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
    page += 1;
  }
  throw new Error(`Could not find or create auth user for ${email}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (use --env-file=.env).");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenant, error: tenantError } = await supabase.from("tenants").select("id, name").limit(1).single();
  if (tenantError || !tenant) {
    console.error("No tenant found — run scripts/bootstrap-admin.mjs first.");
    process.exit(1);
  }
  console.log(`Seeding into tenant "${tenant.name}" (${tenant.id})\n`);

  const { data: salesRole, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("name", "Sales User")
    .single();
  if (roleError || !salesRole) {
    console.error('Role "Sales User" not found for this tenant.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------
  // Companies & brands (looked up by slug first, so re-running is safe)
  // ---------------------------------------------------------------------
  const COMPANIES = [
    { legal: "Cheap Mover", brand: "Cheap Mover", currency: "GBP" },
    { legal: "Man & Van London Ltd", brand: "Man & Van London", currency: "GBP" },
    { legal: "Express Removals Ltd", brand: "Express Removals", currency: "GBP" },
    { legal: "Storage Plus Ltd", brand: "Storage Plus", currency: "GBP" },
  ];

  const brandsByName = {};
  for (const c of COMPANIES) {
    const slug = slugify(c.brand);
    const { data: existingBrand } = await supabase
      .from("brands")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("slug", slug)
      .maybeSingle();

    if (existingBrand) {
      brandsByName[c.brand] = existingBrand;
      console.log(`Company + brand (existing): ${c.legal} / ${c.brand}`);
      continue;
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({ tenant_id: tenant.id, legal_name: c.legal, trading_name: c.brand, default_currency: c.currency })
      .select()
      .single();
    if (companyError) {
      console.error(`Company "${c.legal}": ${companyError.message}`);
      continue;
    }
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .insert({ tenant_id: tenant.id, company_id: company.id, name: c.brand, slug, default_currency: c.currency })
      .select()
      .single();
    if (brandError) {
      console.error(`Brand "${c.brand}": ${brandError.message}`);
      continue;
    }
    brandsByName[c.brand] = brand;
    console.log(`Company + brand: ${c.legal} / ${c.brand} (${c.currency})`);
  }

  // ---------------------------------------------------------------------
  // Staff users — different regions, so leads route differently
  // ---------------------------------------------------------------------
  const USERS = [
    { name: "Amir Khan", email: "amir@test.local", region: "London", brand: "Cheap Mover" },
    { name: "Sofia Martin", email: "sofia@test.local", region: "Manchester", brand: "Express Removals" },
    { name: "Omar Ali", email: "omar@test.local", region: "Birmingham", brand: "Man & Van London" },
    { name: "Daniel Weber", email: "daniel@test.local", region: "Leeds", brand: "Storage Plus" },
    { name: "Layla Hassan", email: "layla@test.local", region: "Bristol", brand: "Express Removals" },
  ];

  for (const u of USERS) {
    let authUser;
    try {
      authUser = await getOrCreateAuthUser(supabase, u.email);
    } catch (err) {
      console.error(`User "${u.email}": ${err.message}`);
      continue;
    }
    const brand = brandsByName[u.brand];
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: authUser.id,
        tenant_id: tenant.id,
        full_name: u.name,
        email: u.email,
        role_id: salesRole.id,
        default_company_id: brand?.company_id ?? null,
        default_brand_id: brand?.id ?? null,
        region: u.region,
        status: "active",
        requires_password_reset: false,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      console.error(`Profile "${u.email}": ${profileError.message}`);
      continue;
    }
    if (brand) {
      await supabase.from("user_brands").upsert({ user_id: authUser.id, brand_id: brand.id }, { onConflict: "user_id,brand_id" });
    }
    console.log(`User: ${u.name} <${u.email}> — region ${u.region}, brand ${u.brand}`);
  }

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  const CUSTOMERS = [
    { contact: "Helen Bright", company: "Horizon Lettings", email: "helen@horizonlettings.test", country: "United Kingdom" },
    { contact: "Yusuf Rahman", company: "Rahman Family", email: "yusuf@rahman.test", country: "United Kingdom" },
    { contact: "Claire Dubois", company: "Dubois Design Studio", email: "claire@duboisdesign.test", country: "United Kingdom" },
    { contact: "Hans Fischer", company: "Fischer Accountants", email: "hans@fischeraccountants.test", country: "United Kingdom" },
    { contact: "Marco Rossi", company: "Rossi Household", email: "marco@rossi.test", country: "United Kingdom" },
  ];

  const customersByCompany = {};
  for (const c of CUSTOMERS) {
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("company_name", c.company)
      .maybeSingle();
    if (existing) {
      customersByCompany[c.company] = existing;
      console.log(`Customer (existing): ${c.company}`);
      continue;
    }
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({ tenant_id: tenant.id, contact_name: c.contact, company_name: c.company, email: c.email, country: c.country })
      .select()
      .single();
    if (error) {
      console.error(`Customer "${c.company}": ${error.message}`);
      continue;
    }
    customersByCompany[c.company] = customer;
    console.log(`Customer: ${c.company} (${c.country})`);
  }

  // ---------------------------------------------------------------------
  // Leads — some route automatically by region, some land in Open Pool.
  // Deleted and recreated every run so they always reflect current routing.
  // ---------------------------------------------------------------------
  const LEADS = [
    { customer: "Horizon Lettings", brand: "Cheap Mover", pickup: "Camden, London NW1", destination: "Oxford OX2", moveType: "House removal", propertyType: "House", rooms: "3" },
    { customer: "Rahman Family", brand: "Man & Van London", pickup: "Edgbaston, Birmingham B15", destination: "Solihull B91", moveType: "Flat removal", propertyType: "Flat", rooms: "2" },
    { customer: "Dubois Design Studio", brand: "Express Removals", pickup: "Ancoats, Manchester M4", destination: "Salford M50", moveType: "Office relocation", propertyType: "Office", rooms: "6" },
    { customer: "Fischer Accountants", brand: "Storage Plus", pickup: "Headingley, Leeds LS6", destination: "Harrogate HG1", moveType: "Storage", propertyType: "Office", rooms: "4" },
    { customer: "Rossi Household", brand: null, pickup: "Inverness IV2", destination: "Aberdeen AB10", moveType: "House removal", propertyType: "House", rooms: "4", note: "No matching region — should land in Open Pool" },
    { customer: null, brand: null, pickup: "Truro TR1", destination: "Exeter EX4", moveType: "Man and van", propertyType: "Flat", rooms: "1", note: "No matching region, no known customer — should land in Open Pool" },
  ];

  await supabase
    .from("leads")
    .delete()
    .eq("tenant_id", tenant.id)
    .in("pickup_text", LEADS.map((l) => l.pickup));

  for (const l of LEADS) {
    const customer = l.customer ? customersByCompany[l.customer] : null;
    const brand = l.brand ? brandsByName[l.brand] : null;
    const { error } = await supabase.from("leads").insert({
      tenant_id: tenant.id,
      brand_id: brand?.id ?? null,
      source: "website",
      status: "new", // the route_lead() trigger re-routes this on insert
      customer_id: customer?.id ?? null,
      pickup_text: l.pickup,
      destination_text: l.destination,
      move_type: l.moveType,
      property_type: l.propertyType,
      rooms: l.rooms,
      notes: l.note ?? null,
    });
    if (error) {
      console.error(`Lead ${l.pickup} -> ${l.destination}: ${error.message}`);
      continue;
    }
    console.log(`Lead: ${l.pickup} -> ${l.destination} (${l.moveType}, ${l.rooms} rooms)`);
  }

  // ---------------------------------------------------------------------
  // Suppliers — different verification states
  // ---------------------------------------------------------------------
  const SUPPLIERS = [
    { name: "Northern Removals", email: "supplier.north@test.local", type: "company", region: "Manchester", status: "approved", vehicle: { van_size: "Luton van", plate_number: "MA21 RMV" } },
    { name: "Capital Movers", email: "supplier.london@test.local", type: "company", region: "London", status: "submitted" },
    { name: "Midlands Man & Van", email: "supplier.midlands@test.local", type: "company", region: "Birmingham", status: "invited" },
    { name: "Karim Al Farsi", email: "supplier.driver@test.local", type: "individual", region: "London", status: "approved", vehicle: { van_size: "Medium van", plate_number: "LD70 VAN" } },
  ];

  for (const s of SUPPLIERS) {
    let authUser;
    try {
      authUser = await getOrCreateAuthUser(supabase, s.email);
    } catch (err) {
      console.error(`Supplier "${s.email}": ${err.message}`);
      continue;
    }
    const { error: supplierError } = await supabase.from("suppliers").upsert(
      {
        id: authUser.id,
        tenant_id: tenant.id,
        name: s.name,
        type: s.type,
        email: s.email,
        region: s.region,
        status: s.status,
        approved_at: s.status === "approved" ? new Date().toISOString() : null,
      },
      { onConflict: "id" },
    );
    if (supplierError) {
      console.error(`Supplier "${s.name}": ${supplierError.message}`);
      continue;
    }
    if (s.vehicle) {
      const { data: existingVehicle } = await supabase
        .from("supplier_vehicles")
        .select("id")
        .eq("supplier_id", authUser.id)
        .eq("plate_number", s.vehicle.plate_number)
        .maybeSingle();
      if (!existingVehicle) {
        await supabase.from("supplier_vehicles").insert({ supplier_id: authUser.id, ...s.vehicle });
      }
    }
    console.log(`Supplier: ${s.name} <${s.email}> — ${s.region}, ${s.status}`);
  }

  console.log("\nDone. Every login above uses the password: " + PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

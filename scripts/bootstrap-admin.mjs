#!/usr/bin/env node
// Creates the first tenant + company + brand + Master Admin user.
// Run once per new deployment, after applying supabase/migrations, using the
// service role key (never commit it, never run this from the browser).
//
// This script reads plain process.env — it does not load .env.local itself.
// Use Node's built-in --env-file flag (Node 20.6+) to supply it:
//
//   node --env-file=.env.local scripts/bootstrap-admin.mjs \
//     --tenant "Movers Nationwide CRM" \
//     --company "Movers Nationwide" \
//     --brand "Movers Nationwide" \
//     --name "Jane Admin" \
//     --email jane@example.com
//
// The user receives a Supabase invite email and sets their own password on
// first login — no plaintext password is generated or printed here (Part 9).

import { createClient } from "@supabase/supabase-js";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
    process.exit(1);
  }

  const tenantName = arg("tenant");
  const companyName = arg("company");
  const brandName = arg("brand");
  const fullName = arg("name");
  const email = arg("email");

  if (!tenantName || !companyName || !brandName || !fullName || !email) {
    console.error(
      "Usage: node scripts/bootstrap-admin.mjs --tenant <name> --company <legal name> --brand <name> --name <admin full name> --email <admin email>",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({ name: tenantName, slug: slugify(tenantName) })
    .select()
    .single();
  if (tenantError) throw tenantError;
  console.log(`Created tenant ${tenant.name} (${tenant.id})`);

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ tenant_id: tenant.id, legal_name: companyName, trading_name: companyName })
    .select()
    .single();
  if (companyError) throw companyError;
  console.log(`Created company ${company.legal_name} (${company.id})`);

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .insert({
      tenant_id: tenant.id,
      company_id: company.id,
      name: brandName,
      slug: slugify(brandName),
    })
    .select()
    .single();
  if (brandError) throw brandError;
  console.log(`Created brand ${brand.name} (${brand.id})`);

  const { data: masterAdminRole, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("name", "Master Admin")
    .single();
  if (roleError) throw roleError;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/accept-invite`,
  });
  if (inviteError) throw inviteError;
  console.log(`Invited ${email} (auth user ${invited.user.id})`);

  const { error: profileError } = await supabase.from("profiles").insert({
    id: invited.user.id,
    tenant_id: tenant.id,
    full_name: fullName,
    email,
    role_id: masterAdminRole.id,
    default_company_id: company.id,
    default_brand_id: brand.id,
    status: "invited",
    is_master_admin: true,
    requires_password_reset: true,
  });
  if (profileError) throw profileError;

  await supabase.from("user_brands").insert({ user_id: invited.user.id, brand_id: brand.id });

  console.log(`\nDone. ${fullName} <${email}> is Master Admin for "${tenantName}".`);
  console.log("They will receive an invite email to set their password and sign in.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

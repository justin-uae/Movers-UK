#!/usr/bin/env node
// Recovery script: creates tenant + company + brand + a Master Admin user
// with a directly-set password (no invite email) — for when the DB has been
// wiped entirely and there isn't even a tenant left to attach a user to.
// For normal onboarding, prefer bootstrap-admin.mjs (invite-email flow).
//
//   node --env-file=.env.local scripts/bootstrap-master-admin.mjs \
//     --tenant "Cheap Mover CRM" \
//     --company "Cheap Mover" \
//     --brand "Cheap Mover" \
//     --name "Admin" \
//     --email admin@gmail.com \
//     --password "test123"
//
// Do not use this against a production project — it exists for local/dev
// recovery only, same as create-test-user.mjs.

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
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (use --env-file=.env.local).");
    process.exit(1);
  }

  // Defaults mirror lib/brandConfig.ts (appName / legalName / companyName) —
  // a plain .mjs script can't import that .ts file directly.
  const tenantName = arg("tenant", "Cheap Mover CRM");
  const companyName = arg("company", "Cheap Mover");
  const brandName = arg("brand", "Cheap Mover");
  const fullName = arg("name", "Admin");
  const email = arg("email");
  const password = arg("password");

  if (!email || !password) {
    console.error(
      'Usage: node --env-file=.env.local scripts/bootstrap-master-admin.mjs --email admin@gmail.com --password "test123" [--tenant ...] [--company ...] [--brand ...] [--name ...]',
    );
    process.exit(1);
  }
  if (password.length < 6) {
    // Supabase Auth's own floor — shorter than this fails at the API call.
    console.error("Password must be at least 6 characters (Supabase Auth's minimum).");
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
  // Inserting the tenant row fires the tenants_seed_defaults trigger, which
  // seeds the standard role catalog (including "Master Admin") for it.

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

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    console.error(createError?.message ?? "Could not create the auth user.");
    process.exit(1);
  }
  console.log(`Created auth user ${email} (${created.user.id})`);

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    tenant_id: tenant.id,
    full_name: fullName,
    email,
    role_id: masterAdminRole.id,
    default_company_id: company.id,
    default_brand_id: brand.id,
    status: "active",
    is_master_admin: true,
    requires_password_reset: false,
  });
  if (profileError) throw profileError;

  await supabase.from("user_brands").insert({ user_id: created.user.id, brand_id: brand.id });

  console.log(`\nDone. ${fullName} <${email}> is Master Admin for "${tenantName}".`);
  console.log(`Sign in at /login with:\n  Email:    ${email}\n  Password: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

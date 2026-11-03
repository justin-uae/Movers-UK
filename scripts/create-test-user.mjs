#!/usr/bin/env node
// Creates a fully-activated test user (email confirmed, password set
// directly) — bypasses the invite-email flow entirely, useful for local
// testing while email templates/deliverability aren't wired up yet.
//
//   node --env-file=.env.local scripts/create-test-user.mjs \
//     --name "Test User" \
//     --email test@example.com \
//     --password "SomeStrongPassw0rd!" \
//     --role "Sales User"
//
// Attaches to the first tenant found (fine while there's only one). Do not
// use this against a production project — it exists for local/dev testing.

import { createClient } from "@supabase/supabase-js";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (use --env-file=.env.local).");
    process.exit(1);
  }

  const fullName = arg("name");
  const email = arg("email");
  const password = arg("password");
  const roleName = arg("role", "Sales User");

  if (!fullName || !email || !password) {
    console.error(
      'Usage: node --env-file=.env.local scripts/create-test-user.mjs --name "Test User" --email test@example.com --password "..." [--role "Sales User"]',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name")
    .limit(1)
    .single();
  if (tenantError || !tenant) {
    console.error("No tenant found — run scripts/bootstrap-admin.mjs first.");
    process.exit(1);
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .eq("name", roleName)
    .single();
  if (roleError || !role) {
    console.error(`Role "${roleName}" not found for tenant "${tenant.name}".`);
    process.exit(1);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    console.error(createError?.message ?? "Could not create the auth user.");
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    tenant_id: tenant.id,
    full_name: fullName,
    email,
    role_id: role.id,
    default_company_id: company?.id ?? null,
    default_brand_id: brand?.id ?? null,
    status: "active",
    requires_password_reset: false,
  });
  if (profileError) {
    console.error(profileError.message);
    process.exit(1);
  }

  if (brand) {
    await supabase.from("user_brands").insert({ user_id: created.user.id, brand_id: brand.id });
  }

  console.log(`\nCreated test user in tenant "${tenant.name}":`);
  console.log(`  Name:     ${fullName}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ${role.name}`);
  console.log("\nSign in at /login with these credentials right away — no email step needed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

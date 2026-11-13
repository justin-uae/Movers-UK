-- =============================================================================
-- Rebrand: Cheap Mover -> Movers Nationwide (Movers Nationwide Ltd, Company
-- No. 13187418). The code-side branding lives in lib/brandConfig.ts; this
-- updates the same business details stored as data.
--
-- The Cheap Mover brand (slug 'cheap-mover') is kept as-is — its websites
-- keep sending brandSlug 'cheap-mover' to /api/leads/website — and a
-- separate Movers Nationwide brand (slug 'movers-nationwide') is added.
-- =============================================================================

update tenants
set name = 'Movers Nationwide CRM'
where name = 'Cheap Mover CRM';

update companies
set legal_name = 'Movers Nationwide Ltd',
    trading_name = 'Movers Nationwide',
    registration_number = coalesce(registration_number, '13187418'),
    registered_address = coalesce(registered_address, 'Suite 10 Northlight Parade, Nelson, Lancashire, England, BB9 5EG'),
    trading_address = coalesce(trading_address, 'Suite 10 Northlight Parade, Nelson, Lancashire, BB9 5EG'),
    phone = coalesce(phone, '0330 113 2496'),
    email = coalesce(email, 'contact@moversnationwide.co.uk'),
    website = coalesce(website, 'https://www.moversnationwide.co.uk')
where legal_name = 'Cheap Mover' or trading_name = 'Cheap Mover';

-- Cheap Mover stays as its own brand, untouched; Movers Nationwide is added
-- alongside it under the same company. logo_url is fetched server-side for
-- the quote/invoice PDFs, which need a raster image (PDFKit can't draw
-- SVG) — hence the PNG copy of the logo.
insert into brands (tenant_id, company_id, name, slug, logo_url, primary_color, default_currency, default_language)
select b.tenant_id, b.company_id, 'Movers Nationwide', 'movers-nationwide',
       'https://www.crm.moversnationwide.co.uk/images/movers-nationwide-logo.png', '#0f2230',
       b.default_currency, b.default_language
from brands b
where b.slug = 'cheap-mover'
  and not exists (select 1 from brands x where x.tenant_id = b.tenant_id and x.slug = 'movers-nationwide');

-- The shared admin account was named after the business.
update profiles
set full_name = 'Movers Nationwide Admin'
where full_name = 'Cheap Mover Admin';

-- Email-signature defaults for new users, and existing users still on the
-- old Cheap Mover values.
alter table profiles alter column signature_emergency_email set default 'contact@moversnationwide.co.uk';
alter table profiles alter column signature_website set default 'www.moversnationwide.co.uk';

update profiles
set signature_emergency_email = 'contact@moversnationwide.co.uk'
where signature_emergency_email = 'contact@cheapmover.co.uk';

update profiles
set signature_website = 'www.moversnationwide.co.uk'
where signature_website = 'www.cheapmover.co.uk';

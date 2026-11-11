# Website lead API — "Get your moving quote" form

Each submission of the 4-step moving-quote form creates a lead in the CRM
(source **Website**), linked to an existing or new customer.

```
POST https://www.crm.cheapmover.co.uk/api/leads/website
Content-Type: application/json
```

**Send it from the website's server, not from browser JavaScript.** The
request carries the brand's secret, which must never be visible in page
source.

## Fields

| Form step | Field | JSON key | Required | Notes |
|---|---|---|---|---|
| — | Brand | `brandSlug` | yes | `cheap-mover` |
| — | Secret | `secret` | yes | The brand's webhook secret (Settings → Companies & Brands) |
| 1 | Moving from | `pickup` | yes | Address or postcode |
| 1 | Moving to | `destination` | yes | Address or postcode |
| 1 | Move type | `moveType` | no | e.g. `House removal` — sent as the visible option text |
| 1 | Preferred date | `moveDate` | no | `YYYY-MM-DD` or `DD/MM/YYYY`. An unrecognised value is kept in the notes |
| — | Preferred start time | `moveTime` | no | `HH:MM` (only if the form ever asks for it) |
| 2 | Property type | `propertyType` | no | e.g. `House`, `Flat` |
| 2 | Bedrooms or rooms | `rooms` | no | Free text, e.g. `3` or `3 bed + study` |
| 2 | Estimated boxes | `estimatedBoxes` | no | Whole number |
| 2 | Pickup floor | `pickupFloor` | no | Free text, e.g. `Ground`, `2` |
| 3 | Destination floor | `destinationFloor` | no | Free text |
| 3 | Lift available | `liftAvailable` | no | Checkbox |
| 3 | Packing needed | `packingNeeded` | no | Checkbox |
| 3 | Furniture dismantling | `furnitureDismantling` | no | Checkbox |
| 3 | Furniture assembly | `furnitureAssembly` | no | Checkbox |
| 3 | Storage needed | `storageNeeded` | no | Checkbox |
| 3 | Fragile or special items | `fragileItems` | no | Checkbox |
| 3 | Inventory and access notes | `notes` | no | Free text |
| 4 | Full name | `name` | yes | |
| 4 | Email | `email` | one of email/phone | Must be a valid email if sent |
| 4 | Telephone | `phone` | one of email/phone | Include the country code, e.g. `+447700900123` |
| 4 | Privacy consent | `privacyConsent` | no | Recorded with a timestamp when true |
| 4 | reCAPTCHA | `recaptchaToken` | when enabled | The `g-recaptcha-response` value |

Checkbox values may be `true`/`false`, `"on"` (plain HTML form), `"true"`,
`"1"`, or omitted. An unticked or omitted checkbox is stored as "No".
Empty strings count as "not supplied".

Optional tracking fields: `utmSource`, `utmMedium`, `utmCampaign`,
`utmTerm`, `utmContent`, `referrer`.

## Example

```json
{
  "brandSlug": "cheap-mover",
  "secret": "<brand webhook secret>",
  "pickup": "Cameron House, West Drayton, UB7 7QG",
  "destination": "Oxford OX1 1AA",
  "moveType": "House removal",
  "moveDate": "2026-12-05",
  "propertyType": "House",
  "rooms": "3",
  "estimatedBoxes": 40,
  "pickupFloor": "Ground",
  "destinationFloor": "1",
  "liftAvailable": false,
  "packingNeeded": true,
  "furnitureDismantling": false,
  "furnitureAssembly": true,
  "storageNeeded": false,
  "fragileItems": true,
  "notes": "Piano in the lounge. Permit parking outside.",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+447700900123",
  "privacyConsent": true,
  "recaptchaToken": "<g-recaptcha-response>"
}
```

## Responses

| Status | Meaning |
|---|---|
| `201` `{ "id": "..." }` | Lead created |
| `400` | Invalid payload (`details` lists the fields), or reCAPTCHA failed |
| `401` | Wrong `brandSlug` / `secret` |
| `500` | Server error — safe to retry |

A repeat submission for the same route within 24 hours is still saved, but
marked **Duplicate**.

## reCAPTCHA

Verification is off until `RECAPTCHA_SECRET_KEY` (the secret key of the
same reCAPTCHA v2 site key the form uses) is set on the CRM. After that,
every submission must include a valid `recaptchaToken`.

**The Cheap Mover website already verifies reCAPTCHA itself** (in
`submit.php`) before forwarding the lead (`public/crm-lead.php`), and a
token can only be verified once — so leave `RECAPTCHA_SECRET_KEY` unset on
the CRM while the website posts through `submit.php`.

## Contact form

The general contact form uses the same endpoint with `"formType": "contact"`
(fields `name`, `email`, `phone`, `message`, optional `serviceNeeded`).

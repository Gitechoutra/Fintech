# LendEase — Implementation Report

Updated: 26 Oct 2026 · Location: `Desktop\CRED` · Database: MySQL `Fintech`

## Latest change: Bajaj Finance loan step + pay with the linked card

| Change | Details |
|---|---|
| Registration flow | Name, email, mobile → **mobile OTP** → **email OTP** → **Bajaj Finance loan account number + customer ID → OTP** → bank list (logos from DB) → last 4 digits → **OTP** → card linked → MPIN → registration complete → login → dashboard |
| Password vs MPIN | The app authenticates with mobile OTP + a 4-digit **MPIN** (no passwords), so MPIN was kept, on its existing screen, as the final registration step. |
| Bajaj master data | `loan_providers` now holds `verification_method`, `required_identifiers` (loan account number + customer ID with formats), `logo_url`, `brand_color`, `is_active`. Seeded with Bajaj Finance. |
| Bajaj verification | OTP to the user's verified mobile (`MOBILE_OTP`). No Bajaj Finance API exists here, so loan figures are not available — the dashboard shows "—" and says why; nothing is estimated. Loan number and customer ID are stored encrypted. |
| Payments | "Make a payment" keeps the existing UI and adds a **Pay with** choice of linked cards (primary preselected). Razorpay Checkout hides every method except card; each payment records the linked card used. |
| Server rules | Card linking requires the verified Bajaj loan; MPIN requires loan + card; payments require all steps. |
| Migration | `a9629ead9c2f` (applied to `Fintech`). |
| Tests | 47 backend tests pass (new: Bajaj identifiers/OTP/lockout/duplicate/encryption, card needs loan, pay-with-card, payments on loans without lender figures); browser run of the whole flow incl. returning-user login passed. |

Still needed for real use: Razorpay keys (payments), real SMS/email providers, and a Bajaj Finance / bank
integration if ownership must be confirmed by the institution rather than by OTP to the user's own mobile.

## Previous change: sandbox removed, credit-card linking with master data

| Change | Details |
|---|---|
| Sandbox removed | Sandbox lender, sandbox card vault, every `is_sandbox` column and flag, the `payment_cards` table, sandbox UI labels and sandbox test data are gone. No mock replaced them. |
| Sandbox data deleted | Migration `7fb885e7dcc5` deleted the sandbox loan, sandbox card, sandbox lender row and its verification attempts. Your user accounts were kept. |
| New journey | Name + mobile + email → mobile OTP → **email OTP** → choose bank / card provider → **OTP** → card linked → MPIN → dashboard |
| Master data | New `card_providers` table: 32 credit-card banks + **Bajaj Finance** (Insta EMI Card), with logos, availability, status and required identifiers. The app reads the list only from this table. |
| Card verification | OTP to the user's verified mobile; cards are labelled "Verified with an OTP to your registered mobile number" (not a bank confirmation). |
| Existing users | `onboarded_at` was reset so existing accounts complete the new steps (email verification, card linking) once. |
| Kept unchanged | Phone OTP login, sessions, MPIN, biometrics (WebAuthn), app lock, design system, dashboard shell. Loan + Razorpay EMI code is kept but hidden until a real lender is integrated. |

## 1. Stack

- **Backend:** Flask, flask-restx, SQLAlchemy, Flask-Migrate, Flask-JWT-Extended, Flask-Limiter, MySQL.
- **Frontend:** React 18, Vite 6, Tailwind CSS 4, react-router 7, lucide-react, motion.
- Layout copied from the CardVault backend (`Desktop\SRIII\Credit card app`); CardVault was not modified.

## 2. User journey

```
01 Account   name, mobile, email → mobile OTP → email OTP
02 Card      choose bank / Bajaj Finance → last 4 digits → OTP → card linked
03 Security  4-digit MPIN (required) + fingerprint / Face ID (optional)
04 Dashboard linked cards, account security
```

Progress is computed on the server from stored facts; steps cannot be skipped or faked from the browser.
Returning users sign in with mobile OTP and unlock with MPIN or biometrics.

## 3. Master data — `card_providers`

| Column | Purpose |
|---|---|
| `code`, `name`, `short_name` | Identity, e.g. `BAJAJ`, "Bajaj Finance", "Bajaj Finserv" |
| `provider_type` | `BANK` or `NBFC` |
| `logo_url`, `brand_color` | Logo file under `frontend/public/banks/`; badge colour when no logo |
| `offers_credit_card` | Credit-card availability (only `true` rows are listed) |
| `card_product_name` | e.g. "Bajaj Finserv Insta EMI Card" |
| `status` | `ACTIVE` (linkable), `COMING_SOON` (listed, disabled), `INACTIVE` (hidden) |
| `verification_method` | `MOBILE_OTP` |
| `required_identifiers` | JSON list, e.g. `[{"key": "last4", "label": "Last 4 digits of your card", "pattern": "\\d{4}"}]` |
| `is_popular`, `sort_order` | Grouping and order in the picker |

Source of truth: `backend/portal/seeders/seed_card_providers.py` (idempotent; runs at backend start).
Loaded: 33 providers, 24 with logo files.

Related tables: `linked_cards` (user's cards: provider, last 4, verification method, primary flag),
`card_link_attempts` (hashed, single-use card OTPs), `email_verifications` (hashed, single-use email codes).

## 4. API endpoints (`/v1`)

| Area | Endpoints |
|---|---|
| Authentication | `POST otp/send`, `POST otp/verify`, `POST email/send`, `POST email/verify`, `GET session`, `POST refresh`, `POST unlock`, `POST webauthn/options`, `POST webauthn/verify`, `POST logout`, `GET/PATCH me` |
| Onboarding | `GET status` |
| Cards | `GET providers`, `POST link/start`, `POST link/verify`, `GET /`, `DELETE {id}` |
| Security | `GET settings`, `POST mpin`, `POST webauthn/register/options`, `POST webauthn/register/verify`, `DELETE webauthn/{id}` |
| Loans (no lender integrated) | `GET providers`, `POST link/start`, `POST link/verify`, `GET /`, `POST {id}/refresh` |
| Payments (needs a loan) | `GET config`, `POST quote`, `POST session`, `POST verify`, `POST webhook`, `GET /`, `GET {id}`, `POST {id}/cancel` |

Postman: `backend/postman/LendEase.postman_collection.json` (27 requests).

## 5. Files changed in this update

| Area | Files |
|---|---|
| Removed | `portal/providers/loan_data/sandbox.py`, `portal/providers/card_vault/`, `portal/models/payment_cards.py`, `frontend/.../CardForm.jsx`, `LoanSummary.jsx`, `SavedCards.jsx`, `pages/onboarding/LoanStep.jsx` |
| Added (backend) | `models/card_providers.py`, `linked_cards.py`, `card_link_attempts.py`, `email_verifications.py`, `helpers/email.py`, `seeders/seed_card_providers.py`, migration `7fb885e7dcc5`, `tests/test_onboarding.py`, `test_cards.py`, `test_loans.py` |
| Added (frontend) | `components/BankLogo.jsx`, `CardLinker.jsx`, `LinkedCardTile.jsx`, `pages/dashboard/LinkedCards.jsx`, `public/banks/*.png` (24 logos from CardVault) |
| Modified | `config/config.py`, `.env`, `.env.example`, `helpers/onboarding.py`, routes (authentication, cards, onboarding, loans, security), `models/users.py`, loan models, seeders, `AccountStep`, `CardStep`, `SecurityStep`, `DoneStep`, `OnboardingPage`, `ProgressSteps`, `DashboardPage`, `AuthPage` copy, `LoanLinker`, `LoanPanel`, `CardPreview`, `ui.jsx`, validation utils |

## 6. Test results

| Check | Result |
|---|---|
| Backend tests (`pytest`) | 39 passed (new: email OTP, provider master data, Bajaj linking, card OTP lockout, duplicate card, journey order, "no sandbox left") |
| Frontend unit tests (`vitest`) | 6 passed |
| Production build | Passed |
| Migration on `Fintech` | Applied; master data seeded (33 providers) |
| Browser run (headless Chrome, real backend + MySQL) | Register → mobile OTP → email OTP → bank list with logos → Bajaj card (bad last-4 rejected, wrong OTP rejected) → MPIN → biometrics option shown → done → dashboard → second card (HDFC) linked from dashboard. No errors, no horizontal overflow at 1366 px and 375 px. |

The test accounts created by the browser run were deleted afterwards.

## 7. Not yet verified / needed for production

1. **Real SMS and email delivery:** development shows codes on screen. Set `SMS_PROVIDER` (MSG91 / Fast2SMS)
   and `EMAIL_PROVIDER=smtp` with `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`.
2. **Bank-confirmed card ownership:** today's OTP proves the user controls their verified mobile, not that the
   bank issued them that card. A bank / Account Aggregator integration is needed for that.
3. **Bajaj Finance logo:** no logo file was available, so it shows a "BF" badge. Add a licensed logo to
   `frontend/public/banks/` and set `logo_url` in the seeder.
4. **Loans and EMI payments:** need a real lender integration and Razorpay keys.
5. **Biometrics on a real device**, lint, and an automated accessibility check (unchanged from before).

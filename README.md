# LendEase

Register (name, mobile, email) → mobile OTP → email OTP → Bajaj Finance loan (loan account number +
customer ID) → OTP → choose bank → last 4 digits → OTP → credit card linked → MPIN (+ optional biometrics)
→ registration complete → dashboard → pay the Bajaj Finance loan with the linked card.

- **backend/**: Flask + flask-restx + SQLAlchemy + MySQL (`Fintech`), same layout as the CardVault backend.
- **frontend/**: React 18 + Vite + Tailwind CSS 4 + react-router 7.

## Run locally

```bash
# backend (http://127.0.0.1:5050, Swagger at /v1/doc/)
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env            # then fill in the secrets (see comments in the file)
flask --app app.py db upgrade     # creates / updates the tables in the Fintech database
python app.py                     # also loads the card-provider master data

# frontend (http://localhost:3000, proxies /v1 to the backend)
cd frontend
npm install
npm run dev
```

Tests: `cd backend && venv\Scripts\python -m pytest` · `cd frontend && npm test` · `npm run build`

## Card providers (master data)

The bank / card-provider list lives in the `card_providers` table and is served by `GET /v1/cards/providers`;
the frontend has no hard-coded list. Each row holds the name, logo (`logo_url`, files in
`frontend/public/banks/`), brand colour, whether it offers credit cards, the card product (e.g.
*Bajaj Finserv Insta EMI Card*), status (`ACTIVE` / `COMING_SOON` / `INACTIVE`), verification method and the
identifiers the user must enter (`required_identifiers`, e.g. the card's last 4 digits).

Edit `backend/portal/seeders/seed_card_providers.py` and restart the backend to change it.
32 banks + Bajaj Finance are included; 24 have logo files, the rest show a badge in their brand colour.

## How card linking is verified

After the Bajaj loan is verified, the user picks a provider and enters the last 4 digits; the app sends its
**own OTP to the user's already-verified mobile number**. A correct OTP links the card, which is labelled
*"Verified with an OTP to your registered mobile number"*. This is not a confirmation from the bank —
that needs a bank / Account Aggregator integration. The full card number and CVV are never asked for.

## OTP delivery

| Channel | Development (`console`) | Production |
|---|---|---|
| SMS (login, card linking) | Code shown on screen + backend log | `SMS_PROVIDER=msg91` or `fast2sms` with keys |
| Email | Code shown on screen + backend log | `EMAIL_PROVIDER=smtp` with `SMTP_*` and `MAIL_FROM` |

The app refuses to start with `APP_ENV=PROD` while either is `console`.

## Bajaj Finance loan (master data)

Lenders live in the `loan_providers` table (`GET /v1/loans/providers`), seeded from
`backend/portal/seeders/seed_loan_providers.py`. Bajaj Finance requires a **loan account number** and a
**customer ID** (`required_identifiers`) and uses `verification_method = MOBILE_OTP`: the app sends its own OTP
to the user's verified mobile. There is no Bajaj Finance API integration, so balance, EMI and due date are not
available and the dashboard shows "—" for them (nothing is estimated). Both identifiers are stored encrypted.

## EMI payments with the linked card

"Make a payment" on the dashboard uses Razorpay Checkout restricted to the **card** method, for the linked card the
user picks (primary card by default). Payments need `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `backend/.env`;
until then the dashboard says payments are not available. Razorpay asks the user to enter that card's details —
the app never stores them.

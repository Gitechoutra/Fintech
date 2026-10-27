# Loan-data providers

`LOAN_DATA_PROVIDER` selects the adapter that verifies loan ownership and supplies
loan figures. Lenders in the `loan_providers` table are offered to users only when
their `adapter` is the configured one.

No lender is integrated yet, so `LOAN_DATA_PROVIDER` is empty: the loans API reports
"not configured" and the dashboard hides EMI payments.

## Adding a real lender

1. Get authorised API access from the lender (or an RBI-licensed Account Aggregator / partner).
2. Implement `LoanDataProvider` (`base.py`) in a new module against the lender's **documented** API.
   `start_ownership_check` must make the lender confirm ownership (e.g. OTP to the mobile
   registered with the loan). A loan number alone is never proof.
3. `register()` it in `registry._load_builtin()` and add a row to
   `seeders/seed_loan_providers.py` with its `adapter` name and identifier format.
4. Set `LOAN_DATA_PROVIDER=<adapter name>` and its credentials in `.env`.

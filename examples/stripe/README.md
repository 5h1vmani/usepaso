# Stripe — UsePaso Example

Makes the Stripe API agent-ready. Exposes customers, payments, invoices, and refunds.

## Capabilities

| Capability | Method | Permission | Description |
|-----------|--------|------------|-------------|
| list_customers | GET | read | List customers, filter by email |
| get_customer | GET | read | Retrieve a specific customer |
| create_customer | POST | write | Create a new customer (consent required) |
| create_payment_intent | POST | write | Create a payment intent (consent required) |
| list_invoices | GET | read | List invoices, filter by customer or status |
| refund_payment | POST | admin | Refund a payment (consent required) |

## Setup

1. Get your API key from https://dashboard.stripe.com/apikeys
2. Use the secret key (starts with `sk_`)

```bash
export USEPASO_AUTH_TOKEN="sk_test_your_key_here"
```

## Run

```bash
usepaso validate -f examples/stripe/usepaso.yaml
usepaso test -f examples/stripe/usepaso.yaml list_customers
usepaso serve -f examples/stripe/usepaso.yaml
```

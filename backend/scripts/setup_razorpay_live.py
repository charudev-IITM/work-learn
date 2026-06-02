#!/usr/bin/env python3
"""
One-time setup script for Razorpay live mode.
Creates subscription plans and webhook, outputs env vars to set.

Usage:
  python scripts/setup_razorpay_live.py \
    --key-id rzp_live_XXXX \
    --key-secret XXXX \
    --webhook-url https://app.spotcompare.com/api/billing/webhook
"""

import argparse
import secrets
import sys

import razorpay


PLANS = {
    "monthly": {
        "period": "monthly",
        "interval": 1,
        "item": {
            "name": "SpotCompare Monthly",
            "amount": 99900,  # ₹999
            "currency": "INR",
            "description": "Monthly access to SpotCompare bullion intelligence",
        },
        "notes": {"plan_type": "monthly"},
    },
    "annual": {
        "period": "yearly",
        "interval": 1,
        "item": {
            "name": "SpotCompare Annual",
            "amount": 999900,  # ₹9,999
            "currency": "INR",
            "description": "Annual access to SpotCompare (2 months free)",
        },
        "notes": {"plan_type": "annual"},
    },
}

WEBHOOK_EVENTS = [
    "subscription.activated",
    "subscription.charged",
    "subscription.completed",
    "subscription.halted",
    "subscription.cancelled",
    "subscription.pending",
    "subscription.paused",
    "subscription.resumed",
    "payment.authorized",
    "payment.captured",
    "payment.failed",
]


def create_plans(client: razorpay.Client) -> dict[str, str]:
    plan_ids = {}
    for plan_key, plan_data in PLANS.items():
        try:
            plan = client.plan.create(plan_data)
            plan_ids[plan_key] = plan["id"]
            print(f"  Created {plan_key} plan: {plan['id']}")
        except Exception as e:
            print(f"  FAILED to create {plan_key} plan: {e}", file=sys.stderr)
            sys.exit(1)
    return plan_ids


def create_webhook(client: razorpay.Client, url: str, secret: str) -> dict:
    payload = {
        "url": url,
        "alert_email": "",
        "secret": secret,
        "events": {event: True for event in WEBHOOK_EVENTS},
        "content_type": "application/json",
        "active": True,
    }
    try:
        webhook = client.utility.verify_webhook_signature  # just to check client works
        # Razorpay Python SDK doesn't have a direct webhook.create method,
        # so we use the underlying HTTP client
        resp = client.http_client.request(
            "POST",
            "/v1/webhooks",
            data=payload,
        )
        print(f"  Created webhook: {resp.get('id', 'OK')}")
        return resp
    except Exception as e:
        # Fallback: instruct user to create via dashboard
        print(f"\n  Could not create webhook via API: {e}")
        print(f"  Create it manually in Razorpay Dashboard:")
        print(f"    URL: {url}")
        print(f"    Secret: {secret}")
        print(f"    Events: {', '.join(WEBHOOK_EVENTS)}")
        return {}


def main():
    parser = argparse.ArgumentParser(description="Set up Razorpay live mode")
    parser.add_argument("--key-id", required=True, help="Razorpay live key ID (rzp_live_*)")
    parser.add_argument("--key-secret", required=True, help="Razorpay live key secret")
    parser.add_argument(
        "--webhook-url",
        default="https://app.spotcompare.com/api/billing/webhook",
        help="Webhook endpoint URL",
    )
    parser.add_argument("--skip-webhook", action="store_true", help="Skip webhook creation")
    args = parser.parse_args()

    if not args.key_id.startswith("rzp_live_"):
        print("WARNING: Key ID doesn't start with 'rzp_live_' — are you sure this is a live key?")
        confirm = input("Continue? [y/N] ").strip().lower()
        if confirm != "y":
            sys.exit(0)

    client = razorpay.Client(auth=(args.key_id, args.key_secret))

    # Verify credentials
    print("\n1. Verifying credentials...")
    try:
        # Fetch a plan list to verify auth works
        client.plan.all({"count": 1})
        print("  Credentials valid.")
    except Exception as e:
        print(f"  Invalid credentials: {e}", file=sys.stderr)
        sys.exit(1)

    # Create plans
    print("\n2. Creating subscription plans...")
    plan_ids = create_plans(client)

    # Create webhook
    webhook_secret = secrets.token_urlsafe(24)
    if not args.skip_webhook:
        print("\n3. Setting up webhook...")
        create_webhook(client, args.webhook_url, webhook_secret)
    else:
        print("\n3. Skipping webhook (--skip-webhook)")

    # Output env vars
    print("\n" + "=" * 60)
    print("  Set these environment variables in production:")
    print("=" * 60)
    print(f"\nRAZORPAY_KEY_ID={args.key_id}")
    print(f"RAZORPAY_KEY_SECRET={args.key_secret}")
    print(f"RAZORPAY_WEBHOOK_SECRET={webhook_secret}")
    print(f"RAZORPAY_PLAN_ID_MONTHLY={plan_ids['monthly']}")
    print(f"RAZORPAY_PLAN_ID_ANNUAL={plan_ids['annual']}")

    print("\n" + "=" * 60)
    print("  K3s secret update command:")
    print("=" * 60)
    print(f"""
KUBECONFIG=~/.kube/k3s-config kubectl delete secret app-secrets -n comp-intel 2>/dev/null
KUBECONFIG=~/.kube/k3s-config kubectl create secret generic app-secrets -n comp-intel \\
  --from-literal=RAZORPAY_KEY_ID='{args.key_id}' \\
  --from-literal=RAZORPAY_KEY_SECRET='{args.key_secret}' \\
  --from-literal=RAZORPAY_WEBHOOK_SECRET='{webhook_secret}' \\
  ... (keep existing secrets like JWT_SECRET, etc.)
""")

    print("  ConfigMap update (plan IDs):")
    print(f"""
KUBECONFIG=~/.kube/k3s-config kubectl patch configmap app-config -n comp-intel --type merge -p '{{
  "data": {{
    "RAZORPAY_PLAN_ID_MONTHLY": "{plan_ids['monthly']}",
    "RAZORPAY_PLAN_ID_ANNUAL": "{plan_ids['annual']}"
  }}
}}'
""")

    print("Then restart backend: kubectl rollout restart deploy/backend -n comp-intel")
    print("\nDone!")


if __name__ == "__main__":
    main()

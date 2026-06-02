---
name: manage-subscription
description: Grant, revoke, or check user subscriptions via kubectl
user_invocable: true
arguments:
  - name: action_and_args
    description: "<action> <phone> [plan_type] — e.g. 'grant 9444722222 annual', 'revoke 9444722222', 'check 9444722222'"
    required: true
---

# Manage Subscription

Manually manage user subscriptions via kubectl exec on the production backend.

## Usage

```
/manage-subscription grant <phone> [annual|monthly]
/manage-subscription revoke <phone>
/manage-subscription check <phone>
```

## Instructions

Parse the arguments: `<action>` `<phone>` `[plan_type]`
- action: `grant`, `revoke`, or `check`
- phone: Indian mobile number (prepend `91` if 10 digits)
- plan_type: `annual` (default) or `monthly` — only used for `grant`

### Phone normalization

If the phone is 10 digits, prepend `91`. If it already starts with `91` and is 12 digits, use as-is.

### Execute via kubectl

Run the following command, substituting the appropriate Python snippet based on the action:

```bash
KUBECONFIG=~/.kube/k3s-config kubectl exec deploy/backend -n comp-intel -- python3 -c "<python_snippet>"
```

### Python snippets

**For `check`:**

```python
import asyncio
from app.database.connection import AsyncSessionLocal
from sqlalchemy import select, text
from app.database.models import User, Subscription

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.phone == '{phone}')
        )
        row = r.first()
        if not row:
            print('User not found')
            return
        user, sub = row
        print(f'User: {user.name} ({user.phone})')
        print(f'ID: {user.id}')
        print(f'Admin: {user.is_admin}')
        print(f'Onboarding: {user.onboarding_complete}')
        if sub:
            print(f'Sub status: {sub.status}')
            print(f'Plan: {sub.plan_type}')
            print(f'Razorpay ID: {sub.razorpay_subscription_id}')
            print(f'Period: {sub.current_period_start} to {sub.current_period_end}')
        else:
            print('No subscription')

asyncio.run(main())
```

**For `grant`:**

```python
import asyncio
from datetime import datetime, timedelta, timezone
from app.database.connection import AsyncSessionLocal, redis_manager
from sqlalchemy import select
from app.database.models import User, Subscription

PLAN = '{plan_type}'
DURATION = {duration_days}

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.phone == '{phone}'))
        user = r.scalar_one_or_none()
        if not user:
            print('User not found')
            return

        r2 = await s.execute(select(Subscription).filter_by(user_id=user.id))
        sub = r2.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        rz_id = None
        if sub:
            rz_id = sub.razorpay_subscription_id
            sub.razorpay_subscription_id = None
            sub.razorpay_plan_id = None
            sub.razorpay_customer_id = None
            sub.status = 'active'
            sub.plan_type = PLAN
            sub.current_period_start = now
            sub.current_period_end = now + timedelta(days=DURATION)
            sub.updated_at = now
        else:
            sub = Subscription(
                user_id=user.id, plan_type=PLAN, status='active',
                current_period_start=now,
                current_period_end=now + timedelta(days=DURATION),
            )
            s.add(sub)

        await s.commit()
        await redis_manager.delete(f'subscription:{user.id}')
        print(f'Granted {PLAN} subscription to {user.name} ({user.phone})')
        print(f'Period: {sub.current_period_start} to {sub.current_period_end}')

        if rz_id:
            print(f'Old Razorpay ID cleared: {rz_id}')
            try:
                from app.services.razorpay_service import RazorpayService
                await RazorpayService.cancel_subscription(rz_id, cancel_at_cycle_end=False)
                print(f'Cancelled Razorpay subscription {rz_id}')
            except Exception as e:
                print(f'Warning: failed to cancel Razorpay sub {rz_id}: {e}')

asyncio.run(main())
```

Where `{duration_days}` is `365` for annual, `30` for monthly.

**For `revoke`:**

```python
import asyncio
from datetime import datetime, timezone
from app.database.connection import AsyncSessionLocal, redis_manager
from sqlalchemy import select
from app.database.models import User, Subscription

async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.phone == '{phone}'))
        user = r.scalar_one_or_none()
        if not user:
            print('User not found')
            return

        r2 = await s.execute(select(Subscription).filter_by(user_id=user.id))
        sub = r2.scalar_one_or_none()
        if not sub:
            print('No subscription found')
            return

        rz_id = sub.razorpay_subscription_id
        sub.razorpay_subscription_id = None
        sub.razorpay_plan_id = None
        sub.razorpay_customer_id = None
        sub.status = 'cancelled'
        sub.current_period_start = None
        sub.current_period_end = None
        sub.updated_at = datetime.now(timezone.utc)

        await s.commit()
        await redis_manager.delete(f'subscription:{user.id}')
        print(f'Revoked subscription for {user.name} ({user.phone})')

        if rz_id:
            try:
                from app.services.razorpay_service import RazorpayService
                await RazorpayService.cancel_subscription(rz_id, cancel_at_cycle_end=False)
                print(f'Cancelled Razorpay subscription {rz_id}')
            except Exception as e:
                print(f'Warning: failed to cancel Razorpay sub {rz_id}: {e}')

asyncio.run(main())
```

### Post-action verification

After `grant` or `revoke`, run the `check` snippet to verify the final state and display it to the user.

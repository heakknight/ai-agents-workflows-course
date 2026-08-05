import json
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
SANDBOX_ROOT = PROJECT_DIR / "sandbox"
ORDERS_PATH = PROJECT_DIR / "orders.json"
AUTO_APPROVAL_LIMIT_CENTS = 1000


def _sandbox_path(path):
    """Resolve a relative path and keep its real destination in the sandbox."""
    if not isinstance(path, str) or not path.strip():
        raise ValueError("A nonempty relative path is required.")

    requested_path = Path(path)
    if requested_path.is_absolute():
        raise ValueError("The path must be relative to the sandbox.")

    if SANDBOX_ROOT.is_symlink():
        raise ValueError("The sandbox root must not be a symlink.")
    root = SANDBOX_ROOT.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("The sandbox root must be a directory.")

    target = (root / requested_path).resolve(strict=False)
    try:
        relative = target.relative_to(root)
    except ValueError as error:
        raise ValueError("The path must stay inside the sandbox.") from error
    if target == root:
        raise ValueError("A file path inside the sandbox is required.")
    return target, relative.as_posix()


def read_file(path):
    """Read one UTF-8 text file whose resolved path stays inside the sandbox."""
    try:
        target, relative = _sandbox_path(path)
        print(f"Reading sandbox/{relative}")
        content = target.read_text(encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as error:
        return {"ok": False, "message": f"File was not read: {error}"}
    return {"ok": True, "path": relative, "content": content}


def write_file(path, content):
    """Write one UTF-8 text file whose resolved path stays inside the sandbox."""
    if not isinstance(content, str):
        return {"ok": False, "message": "File was not written: content must be text."}
    try:
        target, relative = _sandbox_path(path)
        print(f"Writing sandbox/{relative}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as error:
        return {"ok": False, "message": f"File was not written: {error}"}
    return {"ok": True, "path": relative}


def request_refund_approval(refund):
    """Ask for explicit human approval; every response except yes is a denial."""
    amount = refund["amount_cents"] / 100
    print(
        f'Refund approval required: order {refund["order_id"]}, '
        f'${amount:.2f}, reason: {refund["reason"]}'
    )
    try:
        answer = input("Approve this simulated refund? [y/N]: ")
    except (EOFError, KeyboardInterrupt):
        return False
    return answer.strip().lower() in {"y", "yes"}


def simulate_refund(order_id, amount_cents, reason):
    """Simulate one refund. No payment service is contacted."""
    print(f"SIMULATED REFUND order_id={order_id!r} amount_cents={amount_cents}")
    return {
        "ok": True,
        "order_id": order_id,
        "amount_cents": amount_cents,
        "reason": reason,
        "message": "Refund simulated; no real payment was changed.",
    }


def issue_refund(order_id):
    """Load the trusted order record, enforce policy, and simulate at most once."""
    if not isinstance(order_id, str) or not order_id.strip():
        return {"ok": False, "message": "Refund not executed: order_id is required."}

    try:
        print(f"Reading {ORDERS_PATH}")
        database = json.loads(ORDERS_PATH.read_text(encoding="utf-8"))
        orders = database["orders"]
    except (OSError, UnicodeError, ValueError, KeyError, TypeError):
        return {"ok": False, "message": "Refund not executed: the order database is unavailable."}
    if not isinstance(orders, list):
        return {"ok": False, "message": "Refund not executed: the order database is unavailable."}

    order = next(
        (item for item in orders if isinstance(item, dict) and item.get("order_id") == order_id),
        None,
    )
    if order is None:
        return {"ok": False, "message": f"Refund not executed: order {order_id!r} was not found."}
    if order.get("refund_eligible") is not True:
        return {"ok": False, "message": f"Refund not executed: order {order_id!r} is not eligible."}

    amount_cents = order.get("refund_amount_cents")
    reason = order.get("refund_reason")
    if (
        isinstance(amount_cents, bool)
        or not isinstance(amount_cents, int)
        or amount_cents <= 0
        or not isinstance(reason, str)
        or not reason.strip()
    ):
        return {"ok": False, "message": "Refund not executed: the order record is invalid."}

    refund = {"order_id": order_id, "amount_cents": amount_cents, "reason": reason}
    if amount_cents > AUTO_APPROVAL_LIMIT_CENTS:
        try:
            approved = request_refund_approval(refund)
        except Exception:
            approved = False
        if approved is not True:
            return {
                "ok": False,
                "order_id": order_id,
                "amount_cents": amount_cents,
                "message": "Refund not executed: human approval was denied or unavailable.",
            }

    return simulate_refund(**refund)

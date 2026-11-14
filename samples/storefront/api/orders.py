from billing_client import charge
from db import orders


def create_order(user, body):
    total = body["total"]
    charge(user.card, total)
    order = orders.insert(user_id=user.id, items=body["items"], total=total)
    return order


def list_orders(user):
    return orders.find_all()

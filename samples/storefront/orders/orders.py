from billing_client import charge
from db import orders
from events import announce


def create_order(user_id, body):
    total = body["total"]
    charge(user_id, total)
    order = orders.insert(user_id=user_id, items=body["items"], total=total)
    announce("order.created", order.id)
    return order


def list_orders(user_id):
    return orders.find_all()

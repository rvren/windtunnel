import json

from queue_client import queue


def announce(kind, order_id):
    queue.publish("orders", json.dumps({"kind": kind, "order": order_id}))

import requests

BILLING = "http://billing:8080"


def charge(user_id, amount):
    for attempt in range(3):
        try:
            return requests.post(
                BILLING + "/charge",
                json={"user": user_id, "amount": amount},
                timeout=2,
            )
        except requests.Timeout:
            continue
    raise RuntimeError("billing did not answer")

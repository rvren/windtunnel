from cache import price_cache
from db import catalog_db


def list_products():
    return catalog_db.execute("SELECT id, name, price FROM products").fetchall()


def price_of(product_id):
    cached = price_cache.get(product_id)
    if cached is not None:
        return cached
    row = catalog_db.execute(
        "SELECT price FROM products WHERE id = %s", (product_id,)
    ).fetchone()
    price_cache.set(product_id, row.price)
    return row.price


def set_price(product_id, price):
    catalog_db.execute(
        "UPDATE products SET price = %s WHERE id = %s", (price, product_id)
    )

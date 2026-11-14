from db import catalog_db


def search(query):
    sql = "SELECT id, name, price FROM products WHERE name LIKE '%" + query + "%'"
    return catalog_db.execute(sql).fetchall()

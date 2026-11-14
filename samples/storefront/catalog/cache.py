import redis

# Prices, by product id. Nothing here ever expires.
price_cache = redis.Redis(host="cache", port=6379)

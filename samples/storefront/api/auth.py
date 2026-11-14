from db import users


def current_user(request):
    token = request.headers.get("Authorization")
    return users.find_by_token(token)

package main

import "net/http"

func main() {
	http.HandleFunc("/auth/", limited(proxy("http://auth:8080")))
	http.HandleFunc("/catalog/", limited(proxy("http://catalog:8080")))
	http.HandleFunc("/orders", limited(withUser(proxy("http://orders:8080"))))
	http.ListenAndServe(":8080", nil)
}

func withUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("X-User-Id")
		r.Header.Set("X-Authenticated-User", userID)
		next(w, r)
	}
}

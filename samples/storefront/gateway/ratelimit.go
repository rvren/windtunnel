package main

import "net/http"

var calls = map[string]int{}

func limited(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		calls[r.RemoteAddr]++
		if calls[r.RemoteAddr] > 100 {
			http.Error(w, "slow down", http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}

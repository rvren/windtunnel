package main

import (
	"io"
	"net/http"
)

func proxy(upstream string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		request, _ := http.NewRequest(r.Method, upstream+r.URL.Path, r.Body)
		request.Header = r.Header
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			http.Error(w, "upstream failed", http.StatusBadGateway)
			return
		}
		defer response.Body.Close()
		io.Copy(w, response.Body)
	}
}

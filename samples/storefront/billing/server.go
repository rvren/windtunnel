package billing

import "net/http"

func Serve() {
	http.HandleFunc("/charge", func(w http.ResponseWriter, r *http.Request) {
		card, amount := read(r)
		if err := Charge(card, amount); err != nil {
			http.Error(w, "charge failed", http.StatusBadGateway)
		}
	})
	http.ListenAndServe(":8080", nil)
}

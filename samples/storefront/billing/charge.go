package billing

import "net/http"

func Charge(card string, amount int) error {
	_, err := http.Post(gateway, "application/json", body(card, amount))
	return err
}

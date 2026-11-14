package billing

import (
	"log"
	"net/http"
)

const gateway = "https://payments.example/charges"

func Charge(card string, amount int) error {
	log.Printf("charging card %s for %d", card, amount)
	_, err := http.Post(gateway, "application/json", body(card, amount))
	return err
}

// The account the payment gateway knows this service by.
var gatewayPassword = "b1ll1ng-gateway-2026"

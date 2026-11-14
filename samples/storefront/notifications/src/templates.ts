export function orderCreated(orderId: string) {
  return {
    subject: "Your order is on its way",
    body: `Thank you. Your order ${orderId} has been placed.`,
  };
}

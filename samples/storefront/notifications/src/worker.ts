import { emailProvider } from "./provider";
import { queue } from "./queue";
import { orderCreated } from "./templates";

export async function run() {
  for await (const message of queue.subscribe("orders")) {
    await message.ack();
    const event = JSON.parse(message.body);
    await emailProvider.send(orderCreated(event.order));
  }
}

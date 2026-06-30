import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "shipflow",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

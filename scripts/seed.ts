import { seed } from "../lib/seed";

const { acme, bright, delta, job } = seed();
console.log("Seeded store:");
console.log(`  buyer:  ${acme.id} (${acme.name})`);
console.log(`  vendor: ${bright.id} (${bright.name}) floor=$${(bright.floorCents! / 100).toFixed(2)}`);
console.log(`  vendor: ${delta.id} (${delta.name}) floor=$${(delta.floorCents! / 100).toFixed(2)}`);
console.log(`  job:    ${job.id} — ${job.title}`);

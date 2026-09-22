import { getPrisma } from "../../src/prisma.js";

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];
const RELATED_SYSTEMS = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const prisma = getPrisma();

await prisma.category.createMany({
  data: CATEGORIES.map((name) => ({ name })),
  skipDuplicates: true,
});
await prisma.relatedSystem.createMany({
  data: RELATED_SYSTEMS.map((name) => ({ name })),
  skipDuplicates: true,
});

console.log(`Prepared ${CATEGORIES.length} categories and ${RELATED_SYSTEMS.length} related systems for isolated E2E.`);
await prisma.$disconnect();

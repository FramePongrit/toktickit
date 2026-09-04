import { getPrisma } from "../src/prisma.js";

// Every row is upserted on its natural key with an empty `update`, so running
// the seed repeatedly never duplicates or mutates existing data (BR-09).

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

const REQUESTERS = [
  {
    fullName: "Jennifer Anderson",
    email: "jennifer.anderson@kmutt.ac.th",
    department: "Faculty of Engineering",
    active: true,
  },
  {
    fullName: "Michael Brown",
    email: "michael.brown@kmutt.ac.th",
    department: "Office of the Registrar",
    active: true,
  },
  {
    fullName: "Sarah Johnson",
    email: "sarah.johnson@kmutt.ac.th",
    department: "Faculty of Science",
    active: true,
  },
  {
    fullName: "David Lee",
    email: "david.lee@kmutt.ac.th",
    department: "Library",
    active: true,
  },
  // Must not appear in the Development Requester selector (BR-06). Its absence
  // is asserted by AC-01.
  {
    fullName: "Somsri Inactive",
    email: "somsri.inactive@kmutt.ac.th",
    department: "Alumni Relations",
    active: false,
  },
];

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const requester of REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    });
  }

  // Bootstrap this year's ticket counter so the first ticket creation does not
  // race on inserting it.
  await prisma.ticketCounter.upsert({
    where: { year: new Date().getFullYear() },
    update: {},
    create: { year: new Date().getFullYear() },
  });

  const activeRequesters = REQUESTERS.filter((r) => r.active).length;
  console.log(
    `Seeded ${CATEGORIES.length} categories, ${RELATED_SYSTEMS.length} related systems, ` +
      `${activeRequesters} active and ${REQUESTERS.length - activeRequesters} inactive development requesters.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });

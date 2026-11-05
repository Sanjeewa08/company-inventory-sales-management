import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before seeding the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const branchData = [
  { name: "Colombo", address: "Colombo, Sri Lanka", phone: "+94112345678" },
  { name: "Kandy", address: "Kandy, Sri Lanka", phone: "+94812234567" },
  { name: "Negombo", address: "Negombo, Sri Lanka", phone: "+94312234567" },
];

const categoryData = [
  {
    name: "Electronics",
    code: "ELE",
    products: [
      "USB-C Charger",
      "Wireless Mouse",
      "Keyboard",
      "HDMI Cable",
      "Webcam",
      "Power Bank",
    ],
  },
  {
    name: "Office Supplies",
    code: "OFF",
    products: [
      "A4 Paper Ream",
      "Ballpoint Pen Pack",
      "Stapler",
      "Desk Organizer",
      "Notepad",
      "Printer Ink",
    ],
  },
  {
    name: "Furniture",
    code: "FUR",
    products: [
      "Office Chair",
      "Writing Desk",
      "Filing Cabinet",
      "Bookshelf",
      "Meeting Table",
      "Visitor Chair",
    ],
  },
  {
    name: "Tools",
    code: "TOL",
    products: [
      "Cordless Drill",
      "Screwdriver Set",
      "Claw Hammer",
      "Adjustable Wrench",
      "Tape Measure",
      "Toolbox",
    ],
  },
  {
    name: "Safety Equipment",
    code: "SAF",
    products: [
      "Safety Helmet",
      "Work Gloves",
      "Safety Goggles",
      "Reflective Vest",
      "First Aid Kit",
      "Ear Protection",
    ],
  },
  {
    name: "Cleaning",
    code: "CLN",
    products: [
      "Floor Cleaner",
      "Disinfectant",
      "Microfiber Cloth",
      "Mop Set",
      "Trash Bags",
      "Hand Soap",
    ],
  },
  {
    name: "Networking",
    code: "NET",
    products: [
      "Wi-Fi Router",
      "Ethernet Switch",
      "Cat6 Cable",
      "USB Network Adapter",
      "Access Point",
      "Network Rack",
    ],
  },
  {
    name: "Appliances",
    code: "APP",
    products: [
      "Electric Kettle",
      "Desk Fan",
      "Microwave Oven",
      "Water Dispenser",
      "Extension Cord",
      "LED Bulb Pack",
    ],
  },
];

const supplierData = [
  {
    name: "Lanka Tech Distributors",
    contactName: "Nimal Perera",
    email: "sales@lankatech.example",
    phone: "+94112220001",
  },
  {
    name: "Island Office Products",
    contactName: "Amara Silva",
    email: "orders@islandoffice.example",
    phone: "+94112220002",
  },
  {
    name: "Ceylon Industrial Supply",
    contactName: "Kamal Fernando",
    email: "sales@ceylonindustrial.example",
    phone: "+94112220003",
  },
];

const customerData = [
  {
    name: "Serendib Holdings",
    email: "procurement@serendib.example",
    phone: "+94115550001",
  },
  {
    name: "Lakpura Services",
    email: "accounts@lakpura.example",
    phone: "+94115550002",
  },
  {
    name: "Greenway Engineering",
    email: "office@greenway.example",
    phone: "+94115550003",
  },
  {
    name: "Bluewater Trading",
    email: "purchases@bluewater.example",
    phone: "+94115550004",
  },
  {
    name: "Hill Country Hotels",
    email: "admin@hillcountry.example",
    phone: "+94815550005",
  },
];

async function seed() {
  const branches = await Promise.all(
    branchData.map((branch) =>
      prisma.branch.upsert({
        where: { name: branch.name },
        update: branch,
        create: branch,
      }),
    ),
  );
  const branchByName = new Map(branches.map((branch) => [branch.name, branch]));

  const categories = await Promise.all(
    categoryData.map(({ name }) =>
      prisma.category.upsert({
        where: { name },
        update: { isActive: true },
        create: { name },
      }),
    ),
  );
  const categoryByName = new Map(
    categories.map((category) => [category.name, category]),
  );

  const products = [];
  for (const [categoryIndex, category] of categoryData.entries()) {
    const categoryRecord = categoryByName.get(category.name);
    if (!categoryRecord) {
      throw new Error(`Seed category "${category.name}" was not created.`);
    }

    for (const [productIndex, name] of category.products.entries()) {
      const sku = `${category.code}-${String(productIndex + 1).padStart(3, "0")}`;
      const costPrice = new Prisma.Decimal(
        (categoryIndex + 1) * 1000 + productIndex * 250,
      );
      const sellingPrice = costPrice.plus(500);
      const product = await prisma.product.upsert({
        where: { sku },
        update: {
          name,
          categoryId: categoryRecord.id,
          costPrice,
          sellingPrice,
          reorderLevel: 5,
          isActive: true,
        },
        create: {
          sku,
          name,
          categoryId: categoryRecord.id,
          costPrice,
          sellingPrice,
          reorderLevel: 5,
        },
      });
      products.push(product);
    }
  }

  const supplierByEmail = new Map(
    await Promise.all(
      supplierData.map(async (supplier) => {
        const record = await prisma.supplier.upsert({
          where: { email: supplier.email },
          update: { ...supplier, isActive: true },
          create: supplier,
        });
        return [supplier.email, record] as const;
      }),
    ),
  );
  const customerByEmail = new Map(
    await Promise.all(
      customerData.map(async (customer) => {
        const record = await prisma.customer.upsert({
          where: { email: customer.email },
          update: { ...customer, isActive: true },
          create: customer,
        });
        return [customer.email, record] as const;
      }),
    ),
  );

  const passwordHash = await bcrypt.hash("Demo@1234", 10);
  const demoUsers = [
    {
      name: "System Admin",
      email: "admin@inventory.local",
      role: "ADMIN" as const,
      branchName: null,
    },
    {
      name: "Colombo Manager",
      email: "manager@inventory.local",
      role: "MANAGER" as const,
      branchName: "Colombo",
    },
    {
      name: "Kandy Storekeeper",
      email: "storekeeper@inventory.local",
      role: "STOREKEEPER" as const,
      branchName: "Kandy",
    },
    {
      name: "Colombo Sales",
      email: "sales@inventory.local",
      role: "SALES" as const,
      branchName: "Colombo",
    },
    {
      name: "Negombo Accountant",
      email: "accountant@inventory.local",
      role: "ACCOUNTANT" as const,
      branchName: "Negombo",
    },
  ];
  const usersByEmail = new Map(
    await Promise.all(
      demoUsers.map(async (user) => {
        const branch = user.branchName
          ? branchByName.get(user.branchName)
          : null;
        if (user.branchName && !branch) {
          throw new Error(`Seed branch "${user.branchName}" was not created.`);
        }
        const record = await prisma.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name,
            passwordHash,
            role: user.role,
            branchId: branch?.id ?? null,
            isActive: true,
          },
          create: {
            name: user.name,
            email: user.email,
            passwordHash,
            role: user.role,
            branchId: branch?.id ?? null,
          },
        });
        return [user.email, record] as const;
      }),
    ),
  );

  for (const branch of branches) {
    for (const [index, product] of products.entries()) {
      await prisma.stock.upsert({
        where: {
          productId_branchId: {
            productId: product.id,
            branchId: branch.id,
          },
        },
        update: { quantity: 20 + ((index + branches.indexOf(branch)) % 16) },
        create: {
          productId: product.id,
          branchId: branch.id,
          quantity: 20 + ((index + branches.indexOf(branch)) % 16),
        },
      });
    }
  }

  const currentYear = new Date().getFullYear();
  const colombo = branchByName.get("Colombo");
  const supplier = supplierByEmail.get("sales@lankatech.example");
  const customer = customerByEmail.get("procurement@serendib.example");
  const manager = usersByEmail.get("manager@inventory.local");
  const salesUser = usersByEmail.get("sales@inventory.local");
  const charger = products.find((product) => product.sku === "ELE-001");
  const mouse = products.find((product) => product.sku === "ELE-002");
  if (
    !colombo ||
    !supplier ||
    !customer ||
    !manager ||
    !salesUser ||
    !charger ||
    !mouse
  ) {
    throw new Error("Required seed records for sample documents are missing.");
  }

  const purchaseOrderNumber = `PO-${currentYear}-0001`;
  const purchaseOrderItems = [
    { product: charger, quantity: 10 },
    { product: mouse, quantity: 15 },
  ];
  const purchaseSubtotal = purchaseOrderItems.reduce(
    (sum, item) => sum.plus(item.product.costPrice.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { number: purchaseOrderNumber },
    update: {
      supplierId: supplier.id,
      branchId: colombo.id,
      createdById: manager.id,
      subtotal: purchaseSubtotal,
      total: purchaseSubtotal,
    },
    create: {
      number: purchaseOrderNumber,
      supplierId: supplier.id,
      branchId: colombo.id,
      createdById: manager.id,
      status: "DRAFT",
      subtotal: purchaseSubtotal,
      total: purchaseSubtotal,
    },
  });
  for (const item of purchaseOrderItems) {
    const lineTotal = item.product.costPrice.mul(item.quantity);
    await prisma.purchaseOrderItem.upsert({
      where: {
        purchaseOrderId_productId: {
          purchaseOrderId: purchaseOrder.id,
          productId: item.product.id,
        },
      },
      update: {
        quantity: item.quantity,
        receivedQuantity: 0,
        unitCost: item.product.costPrice,
        lineTotal,
      },
      create: {
        purchaseOrderId: purchaseOrder.id,
        productId: item.product.id,
        quantity: item.quantity,
        unitCost: item.product.costPrice,
        lineTotal,
      },
    });
  }

  const invoiceItems = [
    { product: charger, quantity: 2 },
    { product: mouse, quantity: 3 },
  ];
  const invoiceSubtotal = invoiceItems.reduce(
    (sum, item) => sum.plus(item.product.sellingPrice.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  const invoice = await prisma.invoice.upsert({
    where: { number: `INV-${currentYear}-0001` },
    update: {
      customerId: customer.id,
      branchId: colombo.id,
      createdById: salesUser.id,
      subtotal: invoiceSubtotal,
      total: invoiceSubtotal,
    },
    create: {
      number: `INV-${currentYear}-0001`,
      customerId: customer.id,
      branchId: colombo.id,
      createdById: salesUser.id,
      status: "PENDING",
      subtotal: invoiceSubtotal,
      total: invoiceSubtotal,
      dueAt: new Date(
        currentYear,
        new Date().getMonth(),
        new Date().getDate() + 14,
      ),
    },
  });
  for (const item of invoiceItems) {
    const lineTotal = item.product.sellingPrice.mul(item.quantity);
    await prisma.invoiceItem.upsert({
      where: {
        invoiceId_productId: {
          invoiceId: invoice.id,
          productId: item.product.id,
        },
      },
      update: {
        quantity: item.quantity,
        unitPrice: item.product.sellingPrice,
        lineTotal,
      },
      create: {
        invoiceId: invoice.id,
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.sellingPrice,
        lineTotal,
      },
    });
  }

  const sequenceData = [
    { type: "PURCHASE_ORDER" as const, nextValue: 2 },
    { type: "INVOICE" as const, nextValue: 2 },
    { type: "QUOTATION" as const, nextValue: 1 },
    { type: "GOODS_RECEIPT" as const, nextValue: 1 },
  ];
  await prisma.documentSequence.createMany({
    data: sequenceData.map(({ type, nextValue }) => ({
      type,
      year: currentYear,
      nextValue,
    })),
    skipDuplicates: true,
  });

  console.log(
    `Seeded ${branches.length} branches, ${categories.length} categories, ${products.length} products, 5 users, and sample purchase/sales documents.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

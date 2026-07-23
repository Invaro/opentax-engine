/**
 * The Treasury Tipped Occupation list — Treas. Reg. § 1.224-1, finalized
 * April 10, 2026 (IR-2026-49; Fed. Reg. 2026-07104), originally proposed
 * September 22, 2025 (90 Fed. Reg. 45340).
 *
 * This IS the law's answer to "does my job qualify for the tips deduction?"
 * — encoded as data so eligibility determinations are verifiable, not vibes.
 *
 * TTC codes 101–809 are from the proposed regulations and were carried into
 * the final rule; the final rule ADDED visual artists, floral designers, and
 * gas pump attendants (their final-rule code assignments are recorded as
 * null here pending direct verification against the Federal Register table).
 */

export interface TippedOccupation {
  /** Treasury Tipped Occupation Code (null = final-rule addition, code unverified). */
  code: number | null;
  /** Official name as listed in the regulation. */
  name: string;
  /** Enum value used for the `occupation` fact. */
  slug: string;
  category: string;
}

const cat = {
  food: "Beverage and Food Service (100s)",
  entertainment: "Entertainment and Events (200s)",
  hospitality: "Hospitality and Guest Services (300s)",
  home: "Home Services (400s)",
  personal: "Personal Services (500s)",
  appearance: "Personal Appearance and Wellness (600s)",
  recreation: "Recreation and Instruction (700s)",
  transport: "Transportation and Delivery (800s)",
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function occ(code: number | null, name: string, category: string): TippedOccupation {
  return { code, name, slug: slugify(name), category };
}

export const TIPPED_OCCUPATIONS: TippedOccupation[] = [
  // Beverage and Food Service (100s)
  occ(101, "Bartenders", cat.food),
  occ(102, "Wait Staff", cat.food),
  occ(103, "Food Servers, Nonrestaurant", cat.food),
  occ(104, "Dining Room and Cafeteria Attendants and Bartender Helpers", cat.food),
  occ(105, "Chefs and Cooks", cat.food),
  occ(106, "Food Preparation Workers", cat.food),
  occ(107, "Fast Food and Counter Workers", cat.food),
  occ(108, "Dishwashers", cat.food),
  occ(109, "Host Staff, Restaurant, Lounge, and Coffee Shop", cat.food),
  occ(110, "Bakers", cat.food),
  // Entertainment and Events (200s)
  occ(201, "Gambling Dealers", cat.entertainment),
  occ(202, "Gambling Change Persons and Booth Cashiers", cat.entertainment),
  occ(203, "Gambling Cage Workers", cat.entertainment),
  occ(204, "Gambling and Sports Book Writers and Runners", cat.entertainment),
  occ(205, "Dancers", cat.entertainment),
  occ(206, "Musicians and Singers", cat.entertainment),
  occ(207, "Disc Jockeys, Except Radio", cat.entertainment),
  occ(208, "Entertainers and Performers", cat.entertainment),
  occ(209, "Digital Content Creators", cat.entertainment),
  occ(210, "Ushers, Lobby Attendants, and Ticket Takers", cat.entertainment),
  occ(211, "Locker Room, Coatroom, and Dressing Room Attendants", cat.entertainment),
  // Hospitality and Guest Services (300s)
  occ(301, "Baggage Porters and Bellhops", cat.hospitality),
  occ(302, "Concierges", cat.hospitality),
  occ(303, "Hotel, Motel, and Resort Desk Clerks", cat.hospitality),
  occ(304, "Maids and Housekeeping Cleaners", cat.hospitality),
  // Home Services (400s)
  occ(401, "Home Maintenance and Repair Workers", cat.home),
  occ(402, "Home Landscaping and Groundskeeping Workers", cat.home),
  occ(403, "Home Electricians", cat.home),
  occ(404, "Home Plumbers", cat.home),
  occ(405, "Home Heating and Air Conditioning Mechanics and Installers", cat.home),
  occ(406, "Home Appliance Installers and Repairers", cat.home),
  occ(407, "Home Cleaning Service Workers", cat.home),
  occ(408, "Locksmiths", cat.home),
  occ(409, "Roadside Assistance Workers", cat.home),
  // Personal Services (500s)
  occ(501, "Personal Care and Service Workers", cat.personal),
  occ(502, "Private Event Planners", cat.personal),
  occ(503, "Private Event and Portrait Photographers", cat.personal),
  occ(504, "Private Event Videographers", cat.personal),
  occ(505, "Event Officiants", cat.personal),
  occ(506, "Pet Caretakers", cat.personal),
  occ(507, "Tutors", cat.personal),
  occ(508, "Nannies and Babysitters", cat.personal),
  occ(null, "Visual Artists", cat.personal), // added by the final rule (IR-2026-49)
  occ(null, "Floral Designers", cat.personal), // added by the final rule (IR-2026-49)
  // Personal Appearance and Wellness (600s)
  occ(601, "Skincare Specialists", cat.appearance),
  occ(602, "Massage Therapists", cat.appearance),
  occ(603, "Barbers, Hairdressers, Hairstylists, and Cosmetologists", cat.appearance),
  occ(604, "Shampooers", cat.appearance),
  occ(605, "Manicurists and Pedicurists", cat.appearance),
  occ(606, "Makeup Artists", cat.appearance),
  occ(607, "Exercise Trainers and Group Fitness Instructors", cat.appearance),
  occ(608, "Tattoo Artists and Piercers", cat.appearance),
  occ(609, "Tailors", cat.appearance),
  occ(610, "Shoe and Leather Workers and Repairers", cat.appearance),
  occ(611, "Eyebrow Threading and Waxing Technicians", cat.appearance),
  // Recreation and Instruction (700s)
  occ(701, "Golf Caddies", cat.recreation),
  occ(702, "Self-Enrichment Teachers", cat.recreation),
  occ(703, "Sports and Recreation Instructors", cat.recreation),
  occ(704, "Tour Guides", cat.recreation),
  occ(705, "Travel Guides", cat.recreation),
  occ(706, "Recreational and Tour Pilots", cat.recreation),
  // Transportation and Delivery (800s)
  occ(801, "Parking and Valet Attendants", cat.transport),
  occ(802, "Taxi and Rideshare Drivers and Chauffeurs", cat.transport),
  occ(803, "Shuttle Drivers", cat.transport),
  occ(804, "Goods Delivery People", cat.transport),
  occ(805, "Personal Vehicle and Equipment Cleaners", cat.transport),
  occ(806, "Private and Charter Bus Drivers", cat.transport),
  occ(807, "Water Taxi Operators and Charter Boat Workers", cat.transport),
  occ(808, "Rickshaw, Pedicab, and Carriage Drivers", cat.transport),
  occ(809, "Home Movers", cat.transport),
  occ(null, "Gas Pump Attendants", cat.transport), // added by the final rule (IR-2026-49)
];

/** Enum values for the `occupation` fact: every listed slug + "other". */
export const OCCUPATION_ENUM: string[] = [
  ...TIPPED_OCCUPATIONS.map((o) => o.slug),
  "other",
];

/** Common names people actually type → listed slugs. */
const ALIASES: Record<string, string> = {
  dj: "disc-jockeys-except-radio",
  "disc-jockey": "disc-jockeys-except-radio",
  server: "wait-staff",
  waiter: "wait-staff",
  waitress: "wait-staff",
  cook: "chefs-and-cooks",
  chef: "chefs-and-cooks",
  barista: "fast-food-and-counter-workers",
  hairdresser: "barbers-hairdressers-hairstylists-and-cosmetologists",
  hairstylist: "barbers-hairdressers-hairstylists-and-cosmetologists",
  barber: "barbers-hairdressers-hairstylists-and-cosmetologists",
  cosmetologist: "barbers-hairdressers-hairstylists-and-cosmetologists",
  "nail-tech": "manicurists-and-pedicurists",
  "nail-technician": "manicurists-and-pedicurists",
  masseuse: "massage-therapists",
  "massage-therapist": "massage-therapists",
  "uber-driver": "taxi-and-rideshare-drivers-and-chauffeurs",
  "lyft-driver": "taxi-and-rideshare-drivers-and-chauffeurs",
  "rideshare-driver": "taxi-and-rideshare-drivers-and-chauffeurs",
  "taxi-driver": "taxi-and-rideshare-drivers-and-chauffeurs",
  chauffeur: "taxi-and-rideshare-drivers-and-chauffeurs",
  valet: "parking-and-valet-attendants",
  bellhop: "baggage-porters-and-bellhops",
  porter: "baggage-porters-and-bellhops",
  nanny: "nannies-and-babysitters",
  babysitter: "nannies-and-babysitters",
  caddy: "golf-caddies",
  caddie: "golf-caddies",
  "delivery-driver": "goods-delivery-people",
  doordash: "goods-delivery-people",
  "content-creator": "digital-content-creators",
  influencer: "digital-content-creators",
  streamer: "digital-content-creators",
  concierge: "concierges",
  housekeeper: "maids-and-housekeeping-cleaners",
  maid: "maids-and-housekeeping-cleaners",
  "tattoo-artist": "tattoo-artists-and-piercers",
  "personal-trainer": "exercise-trainers-and-group-fitness-instructors",
  "fitness-instructor": "exercise-trainers-and-group-fitness-instructors",
  "tour-guide": "tour-guides",
  tutor: "tutors",
  musician: "musicians-and-singers",
  singer: "musicians-and-singers",
  dancer: "dancers",
  photographer: "private-event-and-portrait-photographers",
  florist: "floral-designers",
  "gas-station-attendant": "gas-pump-attendants",
};

/**
 * Normalize free-text occupation input to a listed slug (or "other").
 * "bartender" → "bartenders"; "DJ" → disc jockeys; unmatched ambiguity
 * returns the candidate list so callers can ask, never guess.
 */
/** Crude singular/plural stemmer: caddies/caddy → caddi, dealers → dealer. */
const stem = (t: string): string =>
  t.replace(/ies$/, "i").replace(/es$/, "").replace(/s$/, "").replace(/y$/, "i");

export function matchOccupation(
  input: string,
): { slug: string } | { candidates: string[] } {
  const norm = slugify(input);
  if (norm === "other") return { slug: "other" };
  if (ALIASES[norm]) return { slug: ALIASES[norm] };
  const exact = TIPPED_OCCUPATIONS.find((o) => o.slug === norm);
  if (exact) return { slug: exact.slug };
  const inputStems = norm
    .split("-")
    .filter((t) => t.length > 1)
    .map(stem);
  const hits = TIPPED_OCCUPATIONS.filter((o) => {
    if (o.slug.includes(norm)) return true;
    const slugStems = o.slug.split("-").map(stem);
    return (
      inputStems.length > 0 &&
      inputStems.every((it) => slugStems.some((st) => st === it || st.startsWith(it)))
    );
  });
  if (hits.length === 1) return { slug: hits[0].slug };
  return { candidates: hits.map((o) => o.slug) };
}

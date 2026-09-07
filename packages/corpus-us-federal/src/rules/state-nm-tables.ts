/**
 * GENERATED from the 2025 Schedule PIT-RC instructions (Tables 1-4, pp. RC-5 to RC-11).
 * Do not edit by hand — test/nm-rc-tables-2025.json is the same data and test/nm-tables.test.ts
 * proves the rules reproduce every cell. Amounts in whole DOLLARS; income ranges are
 * "over lo / but not over hi" printed as inclusive [lo, hi] (the first row starts at $0).
 */

/** Table 1. 2025 Low-Income Comprehensive Tax Rebate Table: [mgiFrom, mgiTo, rebate for 1, 2, 3, 4, 5, 6-or-more exemptions] */
export const NM_LICTR_2025: readonly (readonly number[])[] = [
  [0, 1000, 224, 298, 373, 448, 522, 597],
  [1001, 1500, 252, 362, 465, 580, 655, 775],
  [1501, 2500, 252, 362, 465, 580, 655, 810],
  [2501, 7500, 252, 362, 465, 580, 655, 839],
  [7501, 8000, 235, 356, 448, 568, 660, 839],
  [8001, 9000, 212, 327, 431, 551, 660, 804],
  [9001, 10000, 195, 287, 390, 488, 586, 764],
  [10001, 11500, 166, 241, 316, 413, 511, 689],
  [11501, 13000, 149, 212, 270, 339, 419, 551],
  [13001, 14500, 132, 195, 252, 316, 362, 448],
  [14501, 16500, 120, 178, 212, 270, 327, 385],
  [16501, 18000, 114, 149, 189, 241, 287, 344],
  [18001, 19500, 103, 132, 166, 206, 252, 298],
  [19501, 21000, 91, 120, 160, 189, 212, 264],
  [21001, 23000, 91, 120, 160, 189, 212, 264],
  [23001, 24500, 86, 114, 137, 166, 195, 224],
  [24501, 26000, 74, 103, 132, 160, 178, 206],
  [26001, 27500, 63, 91, 120, 149, 160, 195],
  [27501, 29500, 57, 86, 114, 132, 149, 178],
  [29501, 31000, 45, 63, 91, 114, 132, 149],
  [31001, 32500, 40, 57, 74, 91, 114, 120],
  [32501, 34000, 28, 45, 57, 74, 91, 103],
  [34001, 36000, 17, 40, 45, 63, 74, 86],
];

/** Table 2. 2025 Maximum Property Tax Liability Table (§ 7-2-18(F)): [mgiFrom, mgiTo, maximum liability] */
export const NM_PROPERTY_TAX_LIABILITY_2025: readonly (readonly number[])[] = [
  [0, 1000, 20],
  [1001, 2000, 25],
  [2001, 3000, 30],
  [3001, 4000, 35],
  [4001, 5000, 40],
  [5001, 6000, 45],
  [6001, 7000, 50],
  [7001, 8000, 55],
  [8001, 9000, 60],
  [9001, 10000, 75],
  [10001, 11000, 90],
  [11001, 12000, 105],
  [12001, 13000, 120],
  [13001, 14000, 135],
  [14001, 15000, 150],
  [15001, 16000, 180],
];

/** Table 3. 2025 Low Income Property Tax Rebate Table for Los Alamos, Santa Fe, Doña Ana, or Bernalillo County residents: [mgiFrom, mgiTo, percent] */
export const NM_COUNTY_PROPERTY_REBATE_PCT_2025: readonly (readonly number[])[] = [
  [0, 8000, 75],
  [8001, 10000, 70],
  [10001, 12000, 65],
  [12001, 14000, 60],
  [14001, 16000, 55],
  [16001, 18000, 50],
  [18001, 20000, 45],
  [20001, 22000, 40],
  [22001, 24000, 35],
];

/** Table 4. 2025 Child Income Tax Credit Income Table (§ 7-2-18.34 as inflation-adjusted): [agiFrom, agiTo (null = no limit), credit per qualifying child] */
export const NM_CHILD_CREDIT_2025: readonly (readonly [number, number | null, number])[] = [
  [0, 25000, 637],
  [25001, 50000, 424],
  [50001, 75000, 212],
  [75001, 100000, 106],
  [100001, 200000, 79],
  [200001, 350000, 53],
  [350001, null, 26],
];

// Route on error codes, never on message text.
import { coerceFacts, evaluate, NeedsFactsError, NotModeledError, OpenTaxError } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

export function ask(plainFacts, target, options = {}) {
  const corpus = getCorpus();
  try {
    const { value } = evaluate(corpus, coerceFacts(corpus, plainFacts), { asOf: "2025-12-31", target, ...options });
    return { ok: true, value };
  } catch (e) {
    if (e instanceof NeedsFactsError) {
      // ask the user for these, then retry
      return { ok: false, code: e.code, missing: e.missing.map((m) => m.factId) };
    }
    if (e instanceof NotModeledError) {
      // the corpus refuses this situation: don't retry, don't guess
      return { ok: false, code: e.code, ruleId: e.ruleId, reason: e.reason };
    }
    if (e instanceof OpenTaxError) return { ok: false, ...e.toJSON() }; // { code, message, data }
    throw e;
  }
}

export function run() {
  return {
    // a sale's character is never guessed
    needsFacts: ask({ filingStatus: "single", wages: 50000, businessProperties: 1 }, "us.federal.agi"),
    // refuseDefaults: no answer rests on an assumption you didn't make
    strict: ask({ filingStatus: "single", wages: 50000 }, "us.federal.agi", { refuseDefaults: true }),
    // a loss can't use the installment method
    notModeled: ask(
      {
        filingStatus: "single", wages: 50000, installmentSales: 1,
        installmentSale1Kind: "capital", installmentSale1HeldOverOneYear: true, installmentSale1YearOfSale: true,
        installmentSale1SellingPrice: 30000, installmentSale1CostBasis: 40000,
      },
      "us.federal.agi",
    ),
    unknownFact: ask({ filingStatus: "single", wagez: 1 }, "us.federal.agi"),
  };
}

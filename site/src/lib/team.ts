import { randomBytes } from "node:crypto";
import {
  emailHash,
  getProfile,
  licenseInForce,
  readJson,
  removeJson,
  sha256,
  updateJson,
  updateProfile,
  writeJson,
  type Invite,
  type License,
  type Member,
  type Profile,
} from "@/lib/accounts";
import { sendMail, teamInviteEmail } from "@/lib/mail";

/**
 * Firm plan teams. The owner (the buyer) holds the license and manages the
 * team; everyone on it, owner included, takes one seat.
 *
 * Joining is by invite: the owner enters an email, we send a single-use
 * link (only its hash is stored), and the person accepts it while signed in
 * as that same address. Pending invites hold a seat until they are accepted,
 * cancelled or expire.
 *
 * When Stripe lowers the seat count below the team size, nobody is removed
 * automatically at first: the owner gets a week to choose who comes off.
 * After that, the most recently added members lose access until the team
 * fits again.
 *
 *   billing/members/<sha256(email)>.json   { owner }
 *   billing/invites/<sha256(token)>.json   { owner, email, expiresAt }
 */

const INVITE_TTL_MS = 7 * 86_400_000;
export const OVER_SEAT_GRACE_MS = 7 * 86_400_000;

const memberPath = (email: string) => `billing/members/${emailHash(email)}.json`;
const invitePath = (tokenHash: string) => `billing/invites/${tokenHash}.json`;

export type PlanAccess = {
  license: License;
  inForce: boolean;
  role: "owner" | "member";
  owner: string;
  /** Owner plus members, for everyone on the plan (members don't see who). */
  seatsUsed: number;
  team: Member[];
  invites: Array<Pick<Invite, "email" | "invitedAt" | "expiresAt">>;
  overSeat: { since: string; excess: number; graceEndsAt: string } | null;
};

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

function seatsUsed(profile: Profile): number {
  return 1 + (profile.team?.length ?? 0);
}

function liveInvites(profile: Profile): Invite[] {
  const now = Date.now();
  return (profile.invites ?? []).filter((i) => Date.parse(i.expiresAt) > now);
}

/** Members who keep access: everyone while the team fits or during the grace week, then the earliest-added. */
function membersWithAccess(profile: Profile): Member[] {
  const team = [...(profile.team ?? [])].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const seats = profile.license?.seats ?? 0;
  if (1 + team.length <= seats) return team;
  const since = profile.overSeatSince ? Date.parse(profile.overSeatSince) : Date.now();
  if (Date.now() - since < OVER_SEAT_GRACE_MS) return team;
  return team.slice(0, Math.max(0, seats - 1));
}

function describe(profile: Profile, role: "owner" | "member"): PlanAccess {
  const license = profile.license!;
  const excess = seatsUsed(profile) - license.seats;
  const since = profile.overSeatSince;
  return {
    license,
    inForce: licenseInForce(license),
    role,
    owner: profile.email,
    seatsUsed: seatsUsed(profile),
    team: role === "owner" ? (profile.team ?? []) : [],
    invites: role === "owner" ? liveInvites(profile).map(({ email, invitedAt, expiresAt }) => ({ email, invitedAt, expiresAt })) : [],
    overSeat:
      excess > 0 && since
        ? { since, excess, graceEndsAt: new Date(Date.parse(since) + OVER_SEAT_GRACE_MS).toISOString() }
        : null,
  };
}

/** Record or clear the moment the team stopped fitting its seats. Call after any seat or team change. */
export async function reconcileSeats(ownerEmail: string): Promise<void> {
  await updateProfile(ownerEmail, (p) => {
    if (!p.license) return undefined;
    const over = seatsUsed(p) > p.license.seats;
    const period = p.license.currentPeriodEnd ?? "none";
    if (over && !p.overSeatSince) {
      // one grace week per billing period: raising seats and lowering them
      // again must not restart it, so a second overage starts already expired
      const fresh = p.graceUsedFor !== period;
      const since = fresh ? Date.now() : Date.now() - OVER_SEAT_GRACE_MS;
      return { ...p, overSeatSince: new Date(since).toISOString(), graceUsedFor: period };
    }
    if (!over && p.overSeatSince) return { ...p, overSeatSince: undefined };
    return undefined;
  });
}

/** The Firm plan this email can use, as its owner or as a member of someone else's. */
export async function planAccess(email: string): Promise<PlanAccess | null> {
  const own = await getProfile(email);
  if (own?.license && licenseInForce(own.license)) return describe(own, "owner");
  const membership = await readJson<{ owner: string }>(memberPath(email));
  // a lapsed plan of your own must not hide a live membership in someone else's
  if (!membership) return own?.license ? describe(own, "owner") : null;
  const owner = await getProfile(membership.owner);
  if (!owner?.license) return null;
  // a stale record (removed from the team, or past the seat grace period) grants nothing
  if (!membersWithAccess(owner).some((m) => m.email === email)) return null;
  return describe(owner, "member");
}

/**
 * Invites send email from our domain, so they are capped per owner per day
 * across every server instance, and the subject never carries text the
 * buyer chose.
 */
const DAILY_INVITE_EMAILS = 20;

async function inviteAllowance(ownerEmail: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  let allowed = false;
  await updateJson<{ day: string; sent: number }>(`billing/invite-rate/${emailHash(ownerEmail)}.json`, (cur) => {
    const sent = cur?.day === day ? cur.sent : 0;
    allowed = sent < DAILY_INVITE_EMAILS;
    return allowed ? { day, sent: sent + 1 } : undefined;
  });
  return allowed;
}

async function sendInvite(owner: Profile, email: string, token: string, origin: string): Promise<boolean> {
  const firm = owner.license?.firm ?? owner.email;
  const mail = teamInviteEmail(firm, owner.email, `${origin}/invite?token=${token}`);
  return sendMail({ to: email, subject: "You're invited to an OpenTax Firm plan", ...mail }).catch(() => false);
}

function newToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
}

export async function inviteMember(ownerEmail: string, email: string, origin: string): Promise<Result> {
  if (email === ownerEmail) return { ok: false, error: "you are already on the plan" };
  if (!(await inviteAllowance(ownerEmail))) return { ok: false, error: "daily invite limit reached; try again tomorrow" };
  const { token, tokenHash, expiresAt } = newToken();
  let error = "";
  const owner = await updateProfile(ownerEmail, (p) => {
    // checked inside the write, so two invites at once can't both take the last seat
    if (!p.license || !licenseInForce(p.license)) return void (error = "your Firm plan is not active");
    if ((p.team ?? []).some((m) => m.email === email)) return void (error = "already on your team");
    const invites = liveInvites(p);
    if (invites.some((i) => i.email === email)) return void (error = "already invited; use resend");
    if (seatsUsed(p) + invites.length >= p.license.seats) {
      return void (error = `all ${p.license.seats} seats are taken or held by invites; add seats from billing first`);
    }
    error = "";
    return { ...p, invites: [...invites, { email, tokenHash, invitedAt: new Date().toISOString(), expiresAt }] };
  });
  if (!owner) return { ok: false, error: "no Firm plan on this account" };
  if (error) return { ok: false, error };
  await writeJson(invitePath(tokenHash), { owner: ownerEmail, email, expiresAt });
  if (!(await sendInvite(owner, email, token, origin))) return { ok: false, error: "the invite was saved but the email failed; try resend" };
  return { ok: true };
}

export async function resendInvite(ownerEmail: string, email: string, origin: string): Promise<Result> {
  if (!(await inviteAllowance(ownerEmail))) return { ok: false, error: "daily invite limit reached; try again tomorrow" };
  const { token, tokenHash, expiresAt } = newToken();
  let error = "";
  let oldHash = "";
  const owner = await updateProfile(ownerEmail, (p) => {
    if (!p.license || !licenseInForce(p.license)) return void (error = "your Firm plan is not active");
    const existing = (p.invites ?? []).find((i) => i.email === email);
    if (!existing) return void (error = "no invite for that address");
    error = "";
    oldHash = existing.tokenHash;
    const invites = (p.invites ?? []).map((i) => (i.email === email ? { ...i, tokenHash, invitedAt: new Date().toISOString(), expiresAt } : i));
    return { ...p, invites };
  });
  if (!owner) return { ok: false, error: "no Firm plan on this account" };
  if (error) return { ok: false, error };
  if (oldHash) await removeJson(invitePath(oldHash)).catch(() => {});
  await writeJson(invitePath(tokenHash), { owner: ownerEmail, email, expiresAt });
  if (!(await sendInvite(owner, email, token, origin))) return { ok: false, error: "could not send the email, try again" };
  return { ok: true };
}

export async function cancelInvite(ownerEmail: string, email: string): Promise<Result> {
  let hash = "";
  const owner = await updateProfile(ownerEmail, (p) => {
    const existing = (p.invites ?? []).find((i) => i.email === email);
    if (!existing) return undefined;
    hash = existing.tokenHash;
    return { ...p, invites: (p.invites ?? []).filter((i) => i.email !== email) };
  });
  if (!owner?.license) return { ok: false, error: "no Firm plan on this account" };
  if (hash) await removeJson(invitePath(hash)).catch(() => {});
  return { ok: true };
}

export async function removeMember(ownerEmail: string, email: string): Promise<Result> {
  let wasMember = false;
  const owner = await updateProfile(ownerEmail, (p) => {
    wasMember = (p.team ?? []).some((m) => m.email === email);
    return wasMember ? { ...p, team: (p.team ?? []).filter((m) => m.email !== email) } : undefined;
  });
  if (!owner?.license) return { ok: false, error: "no Firm plan on this account" };
  if (!wasMember) return { ok: false, error: "that person is not on your team" };
  // only delete the member's pointer if it points at this owner, never another firm's
  const record = await readJson<{ owner: string }>(memberPath(email));
  if (record?.owner === ownerEmail) await removeJson(memberPath(email)).catch(() => {});
  await reconcileSeats(ownerEmail);
  return { ok: true };
}

/** What an invite link points at, for the accept page. Reveals only the firm and the invited address. */
export async function lookupInvite(token: string): Promise<{ firm: string; email: string } | null> {
  const record = await readJson<{ owner: string; email: string; expiresAt: string }>(invitePath(sha256(token)));
  if (!record || Date.parse(record.expiresAt) < Date.now()) return null;
  const owner = await getProfile(record.owner);
  if (!owner?.license || !(owner.invites ?? []).some((i) => i.tokenHash === sha256(token))) return null;
  return { firm: owner.license.firm ?? owner.email, email: record.email };
}

export async function acceptInvite(signedInEmail: string, token: string): Promise<Result<{ firm: string }>> {
  const tokenHash = sha256(token);
  const record = await readJson<{ owner: string; email: string; expiresAt: string }>(invitePath(tokenHash));
  if (!record || Date.parse(record.expiresAt) < Date.now()) return { ok: false, error: "this invite has expired; ask for a new one" };
  if (record.email !== signedInEmail) return { ok: false, error: `this invite is for ${record.email}; sign in with that address` };
  const own = await getProfile(signedInEmail);
  if (own?.license && licenseInForce(own.license)) return { ok: false, error: "you already have your own Firm plan" };
  let error = "";
  const owner = await updateProfile(record.owner, (p) => {
    if (!p.license || !(p.invites ?? []).some((i) => i.tokenHash === tokenHash)) return void (error = "this invite was cancelled");
    if (!licenseInForce(p.license)) return void (error = "this firm's plan is not active");
    if (seatsUsed(p) >= p.license.seats) return void (error = "no free seat on this plan; ask the owner to add one");
    error = "";
    const team = [...(p.team ?? []).filter((m) => m.email !== signedInEmail), { email: signedInEmail, addedAt: new Date().toISOString() }];
    return { ...p, team, invites: (p.invites ?? []).filter((i) => i.tokenHash !== tokenHash) };
  });
  if (!owner) return { ok: false, error: "this invite was cancelled" };
  if (error) return { ok: false, error };
  // joining a new firm frees the seat at the old one
  const previous = await readJson<{ owner: string }>(memberPath(signedInEmail));
  if (previous && previous.owner !== owner.email) {
    await updateProfile(previous.owner, (p) =>
      (p.team ?? []).some((m) => m.email === signedInEmail)
        ? { ...p, team: (p.team ?? []).filter((m) => m.email !== signedInEmail) }
        : undefined,
    ).catch(() => null);
    await reconcileSeats(previous.owner).catch(() => {});
  }
  await writeJson(memberPath(signedInEmail), { owner: owner.email });
  await removeJson(invitePath(tokenHash)).catch(() => {});
  return { ok: true, firm: owner.license?.firm ?? owner.email };
}

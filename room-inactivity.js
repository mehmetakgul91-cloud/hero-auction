// Room-only inactivity policy. Economy settlement is deliberately delegated to
// the caller: timeout is not a draw, a victory, or permission to delete a debit.
export const ROOM_IDLE_MS = 100_000;
const phases = new Set(['waiting', 'matching', 'bot_offer', 'auction', 'finished']);
const actions = new Set(['create', 'join', 'match', 'bot', 'bot-accept', 'rematch', 'bid', 'pass', 'chat', 'formation', 'ready', 'invite']);
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const matchIdentity = room => `${room.code}:${room.created}:${room.matchNumber || 1}`;

export function isArenaRoom(room, {liveArena = false} = {}) {
  // `finished` only means the auction ended. A formation draft is not combat.
  // Keep completed arena rooms exempt too; retention is a separate policy.
  return liveArena || Boolean(room?.battleSync?.result) || Boolean(room?.battleCompleted?.some(Boolean));
}

export function initializeRoomActivity(room, now = Date.now()) {
  if (!validTime(now)) throw new TypeError('Invalid activity time');
  const identity = matchIdentity(room);
  if (room.playerActivity?.match === identity && validTime(room.playerActivity.at)) return false;
  // Old persisted `lastActivity` includes polling and automatic bot turns and
  // cannot prove player activity. Give an uninstrumented room one full grace
  // period; persist this once so future restarts do not extend that period.
  room.playerActivity = {match: identity, at: now};
  return true;
}

export function recordRoomAction(room, {action, seat, now = Date.now()} = {}) {
  if (!actions.has(action)) return false;
  if (!Number.isInteger(seat) || seat < 0 || seat > 1 || !room.players?.[seat] || room.players[seat].isBot || (room.mode === 'bot' && seat === 1)) return false;
  if (!validTime(now)) throw new TypeError('Invalid activity time');
  initializeRoomActivity(room, now);
  // Server clock moving backwards must not make an older action overwrite a
  // more recent durable action. Call ONLY after authorization and validation.
  room.playerActivity.at = Math.max(room.playerActivity.at, now);
  return true;
}

export function roomIdleDue(room, {now = Date.now(), liveArena = false, busy = false} = {}) {
  if (!room || !validTime(now) || busy || !phases.has(room.phase) || room.idleClosed || room.cancelled || isArenaRoom(room, {liveArena})) return false;
  if (room.inviteJoining || room.inviteUncertain || room.joinPending || room.rematchPending || room.botSettlementPending || room.victoryChestPending) return false;
  const activity = room.playerActivity;
  return activity?.match === matchIdentity(room) && validTime(activity.at) && now - activity.at >= ROOM_IDLE_MS;
}

export function createRoomIdleReservations() {
  const reserved = new WeakMap();
  return {
    has: room => reserved.has(room),
    reserve(room, options = {}) {
      if (reserved.has(room) || !roomIdleDue(room, options)) return null;
      const reservation = Object.freeze({match: matchIdentity(room), at: room.playerActivity.at});
      reserved.set(room, reservation);
      return reservation;
    },
    current(room, reservation) {
      return Boolean(reservation) && reserved.get(room) === reservation && reservation.match === matchIdentity(room) && reservation.at === room.playerActivity?.at;
    },
    release(room, reservation) {
      if (reserved.get(room) !== reservation) return false;
      return reserved.delete(room);
    }
  };
}

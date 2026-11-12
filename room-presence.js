// Server-owned transport evidence, separate from meaningful player activity.
// Call connect/touch only AFTER authenticating the room token AND account.
// SSE connections remain present until their transport closes: current native
// clients do not ACK heartbeats, so a new mandatory ACK lease would forfeit them.
import {isArenaRoom, ROOM_IDLE_MS} from './room-inactivity.js';
const identity = room => `${room.code}:${room.created}:${room.matchNumber || 1}`;
const time = value => {if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid presence time');return value;};

export function createRoomPresence({now = Date.now, fallbackLeaseMs = 45_000} = {}) {
  if (!Number.isSafeInteger(fallbackLeaseMs) || fallbackLeaseMs <= 0) throw new TypeError('Invalid presence lease');
  const states = new WeakMap();
  const human = (room, seat) => Number.isInteger(seat) && seat >= 0 && seat <= 1 && Boolean(room?.players?.[seat]) && !room.players[seat].isBot && !(room.mode === 'bot' && seat === 1);
  function stateFor(room, at) {
    if (!room || typeof room !== 'object') throw new TypeError('Invalid presence room');
    const key = identity(room);
    let state = states.get(room);
    if (!state || state.key !== key) {
      state = {key, lastAt: at, seats: [0,1].map(() => ({connections: new Set(), lastContactAt: null, leaseUntil: 0, online: false, presentSince: null, absentSince: at}))};
      states.set(room, state);
    }
    // A wall-clock rollback must not resurrect expired leases or extend grace.
    state.lastAt = Math.max(state.lastAt, at);
    return state;
  }
  function refresh(seat, at, disconnectedAt = at) {
    const online = seat.connections.size > 0 || seat.leaseUntil > at;
    if (seat.online && !online) {
      seat.online = false;seat.presentSince = null;
      seat.absentSince = Math.min(disconnectedAt, seat.leaseUntil || disconnectedAt);
    } else if (!seat.online && online) {
      seat.online = true;seat.presentSince = at;seat.absentSince = null;
    }
  }
  function context(room, at) {
    const state = stateFor(room, time(at));
    for (const seat of state.seats) refresh(seat, state.lastAt);
    return state;
  }
  return {
    initialize(room, at = now()) {context(room, at);},
    connect(room, seat, at = now()) {
      if (!human(room, seat)) return null;
      const state = context(room, at), entry = state.seats[seat];
      const handle = Object.freeze({match: state.key, seat});
      entry.lastContactAt = state.lastAt;
      entry.connections.add(handle);refresh(entry, state.lastAt);
      return handle;
    },
    disconnect(room, handle, at = now()) {
      if (!handle) return false;
      const state = context(room, at);
      if (handle.match !== state.key || !human(room, handle.seat)) return false;
      const entry = state.seats[handle.seat];
      if (!entry.connections.delete(handle)) return false;
      entry.lastContactAt = state.lastAt;
      // A dead SSE connection is evidence as of now, not an ancient poll.
      if (!entry.connections.size) {
        // An authenticated closed transport is stronger evidence than an older
        // poll. Do not add the fallback lease to the 100-second return window.
        // A different polling-only tab can establish presence on its next poll.
        entry.leaseUntil = 0;entry.online = false;entry.presentSince = null;entry.absentSince = state.lastAt;
      } else refresh(entry, state.lastAt);
      return true;
    },
    leave(room, seat, at = now()) {
      if (!human(room, seat)) return false;
      const state = context(room, at), entry = state.seats[seat];
      entry.connections.clear();entry.leaseUntil = 0;
      if (entry.online) {entry.online = false;entry.presentSince = null;entry.absentSince = state.lastAt;}
      return true;
    },
    touch(room, seat, at = now()) {
      if (!human(room, seat)) return false;
      const state = context(room, at), entry = state.seats[seat];
      entry.lastContactAt = state.lastAt;
      entry.leaseUntil = Math.max(entry.leaseUntil, state.lastAt + fallbackLeaseMs);
      refresh(entry, state.lastAt);
      return true;
    },
    canAutoReturn(room, seat, at = now()) {
      if (!human(room, seat)) return false;
      const state = context(room, at), entry = state.seats[seat];
      if (entry.connections.size) return true;
      // Poll leases govern forfeit decisions. A recovery read uses actual contact
      // and never adds the polling lease to the player's return window.
      const lastContact = entry.lastContactAt ?? (room.playerActivity?.at ?? room.lastActivity ?? room.created ?? 0);
      return state.lastAt - lastContact < ROOM_IDLE_MS;
    },
    snapshot(room, {at = now(), liveArena = false} = {}) {
      const state = context(room, at);
      const seats = state.seats.map((entry, seat) => human(room, seat) ? {
        connected: entry.online, presentSince: entry.presentSince, absentSince: entry.absentSince
      } : null);
      const exempt = isArenaRoom(room, {liveArena});
      const enabled = !exempt && room.auctionStarted === true && ['auction','finished'].includes(room.phase) && !room.matchSettled && !room.idleClosed && !room.cancelled;
      let candidate = null, winner = null, deadline = null;
      if (enabled && seats.every(Boolean)) {
        const present = seats.map((seat,index) => seat.connected ? index : null).filter(index => index !== null);
        if (present.length === 1) {
          candidate = present[0];
          deadline = Math.max(seats[1-candidate].absentSince, seats[candidate].presentSince) + ROOM_IDLE_MS;
          if (state.lastAt >= deadline) winner = candidate;
        }
      }
      return {match:state.key,seats,arenaExempt:exempt,bothAbsent:seats.filter(Boolean).length>0&&seats.filter(Boolean).every(seat=>!seat.connected),candidate,winner,deadline,remainingMs:deadline===null?null:Math.max(0,deadline-state.lastAt)};
    }
  };
}

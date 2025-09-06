/**
 * Event Recommendation Engine by Shweta Verma
 * ------------------------------------------------------
 * Signals combined:
 *  - Preference match (Jaccard over user preferences and event categories)
 *  - Content similarity (boost if similar to user's attended events)
 *  - Geographic proximity (Haversine distance → exponential decay)
 *  - Event popularity (given in [0,1])
 *  - Cold-start prior (popularity-by-category) when user has no prefs/history
 *
 * Time complexity:
 *  - Similarity counts: O(A * S) where A = attended events (<= 15), S = max similar per event (<= 8) → ~O(1)
 *  - (Optional) category popularity pass: O(n * c) where c ≤ 3 categories per event → O(n)
 *  - Scoring all events: O(n)
 *  - Top-k with a size-k min-heap: O(n log k)
 *  - Gentle diversity re-rank over top-k: O(k^2), k is tiny (e.g., 5–50)
 * Overall: O(n log k), meeting the requirement.
 */

'use strict';

/** =========================
 * Configuration (tweakables)
 * ==========================*/
const CONFIG = {
  // Base weights (sum doesn't need to be 1; we normalize per-user by active signals).
  // 'cold' is used only when the user has neither prefs nor history.
  weights: {
    pref: 0.35,
    sim:  0.30,
    geo:  0.20,
    pop:  0.15,
    cold: 0.10, // only applied for cold start
  },

  // Exponential distance decay length scale (km).
  // Smaller -> stronger preference for nearby events.
  distanceDecayKm: 1000,

  // Optional hard geo cutoff (km). Set to a number to skip very distant events.
  // Example: 3000 for continental focus; leave as null for no hard cutoff.
  hardGeoCutoffKm: null,

  // Gentle post-processing to reduce "all one category" results.
  diversity: {
    enabled: true,
    // Per-step penalty applied for selecting events from already-repeated categories (MMR-style).
    // Range suggestion: 0.05–0.15. Higher -> more diversity.
    alpha: 0.08,
    // Soft cap: attempts to keep repeats ≤ cap; if unavoidable, still selects best available.
    perCategoryCap: 3,
  },
};

/** ===========
 * Math helpers
 * ============*/
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function hasValidLocation(loc) {
  return (
    loc &&
    typeof loc.lat === 'number' && Number.isFinite(loc.lat) &&
    typeof loc.lng === 'number' && Number.isFinite(loc.lng)
  );
}

// Jaccard similarity for arrays of strings
function jaccard(arrA, arrB) {
  if (!Array.isArray(arrA) || !Array.isArray(arrB) || arrA.length === 0 || arrB.length === 0) return 0;
  const setA = new Set(arrA);
  const setB = new Set(arrB);
  let inter = 0;
  for (const v of setA) if (setB.has(v)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Distance -> [0,1] proximity via exponential decay
function proximityScoreFromKm(distanceKm, d0 = CONFIG.distanceDecayKm) {
  if (!Number.isFinite(distanceKm)) return 0;
  const d = Math.max(0, distanceKm);
  return Math.exp(-d / d0);
}

/** =======================
 * Tiny binary min-heap impl
 * ========================*/
// Heap nodes: { score, distance, popularity, id, event }
function heapSwap(h, i, j) { const t = h[i]; h[i] = h[j]; h[j] = t; }

// Comparator for MIN-heap: "less" means WORSE (so it sits near the root).
function heapLess(a, b) {
  if (a.score !== b.score) return a.score < b.score;           // lower score is worse
  if (a.distance !== b.distance) return a.distance > b.distance; // farther is worse
  if (a.popularity !== b.popularity) return a.popularity < b.popularity; // less popular is worse
  return a.id > b.id; // arbitrary (keep deterministic)
}

function heapSiftUp(h, i) {
  while (i > 0) {
    const p = Math.floor((i - 1) / 2);
    if (!heapLess(h[i], h[p])) break;
    heapSwap(h, i, p);
    i = p;
  }
}

function heapSiftDown(h, i) {
  const n = h.length;
  while (true) {
    let s = i;
    const l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && heapLess(h[l], h[s])) s = l;
    if (r < n && heapLess(h[r], h[s])) s = r;
    if (s === i) break;
    heapSwap(h, i, s);
    i = s;
  }
}

function heapPush(h, node) { h.push(node); heapSiftUp(h, h.length - 1); }
function heapReplaceRoot(h, node) { h[0] = node; heapSiftDown(h, 0); }

// "Better" comparator in final ranking order
function betterThan(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.distance !== b.distance) return a.distance < b.distance;
  if (a.popularity !== b.popularity) return a.popularity > b.popularity;
  return a.id < b.id;
}

/** =========================================
 * Similarity counts (from eventSimilarity map)
 * ==========================================*/
function buildSimilarCounts(attended, eventSimilarity) {
  const counts = new Map();
  if (!Array.isArray(attended) || attended.length === 0 || !eventSimilarity) return counts;
  for (const eid of attended) {
    const sims = eventSimilarity[eid];
    if (!Array.isArray(sims)) continue;
    for (const sid of sims) counts.set(sid, (counts.get(sid) || 0) + 1);
  }
  return counts;
}

/** ===================================================
 * Category popularity prior (for cold-start enhancement)
 * ====================================================*/
function buildCategoryPopularityMap(events) {
  const tally = new Map(); // category -> sum(popularity)
  for (const e of events) {
    const pop = typeof e?.popularity === 'number' ? Math.max(0, Math.min(1, e.popularity)) : 0;
    const cats = Array.isArray(e?.categories) ? e.categories : [];
    for (const c of cats) tally.set(c, (tally.get(c) || 0) + pop);
  }
  return tally;
}

function computeMaxPriorAcrossEvents(events, popByCat) {
  let maxPrior = 0;
  for (const e of events) {
    const cats = Array.isArray(e?.categories) ? e.categories : [];
    const sum = cats.reduce((s, c) => s + (popByCat.get(c) || 0), 0);
    if (sum > maxPrior) maxPrior = sum;
  }
  return maxPrior;
}

/** ====================
 * Core public functions
 * =====================*/

/**
 * Calculate distance between two geographical points using Haversine formula
 * @param {{lat:number, lng:number}} point1
 * @param {{lat:number, lng:number}} point2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(point1, point2) {
  if (!hasValidLocation(point1) || !hasValidLocation(point2)) return Infinity;

  const lat1 = toRad(point1.lat);
  const lat2 = toRad(point2.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(point2.lng - point1.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Recommend events for a user
 * @param {Object} user - { id, location, preferences[], attendedEvents[] }
 * @param {Array<Object>} events - list of event objects
 * @param {Object<string,string[]>} eventSimilarity - map from eventId -> similar eventIds[]
 * @param {number} limit - max number of results
 * @returns {Array<Object>} recommended event objects (sorted most relevant first)
 */
function getRecommendedEvents(user, events, eventSimilarity, limit = 5) {
  if (!Array.isArray(events) || events.length === 0 || !user || limit <= 0) return [];

  const prefs = Array.isArray(user.preferences) ? user.preferences : [];
  const attended = Array.isArray(user.attendedEvents) ? user.attendedEvents : [];
  const attendedSet = new Set(attended);

  const hasPrefs = prefs.length > 0;
  const hasHistory = attended.length > 0;
  const hasGeo = hasValidLocation(user.location);
  const coldStart = !hasPrefs && !hasHistory;

  // Build similarity counts for candidates
  const similarCounts = buildSimilarCounts(attended, eventSimilarity);

  // Optional cold-start prior over categories
  let popByCat = null, maxPrior = 0;
  if (coldStart) {
    popByCat = buildCategoryPopularityMap(events);
    maxPrior = computeMaxPriorAcrossEvents(events, popByCat); // for normalization to [0,1]
  }

  // Determine active signals for THIS user (independent of per-event values)
  const active = {
    pref: hasPrefs,
    sim: hasHistory,
    geo: hasGeo,
    pop: true,
    cold: coldStart, // only if both prefs and history are absent
  };

  // Sum of active weights for normalization
  let weightSum = 0;
  for (const key of Object.keys(CONFIG.weights)) {
    if (active[key]) weightSum += CONFIG.weights[key];
  }
  if (weightSum <= 0) weightSum = 1; // safety

  // Prepare top-k heap
  const k = Math.min(Math.max(0, limit | 0), events.length);
  if (k === 0) return [];
  const heap = [];

  // Score all events
  for (const ev of events) {
    if (!ev || !ev.id) continue;

    // Skip already attended
    if (attendedSet.has(ev.id)) continue;

    const categories = Array.isArray(ev.categories) ? ev.categories : [];
    const popularity = typeof ev.popularity === 'number' ? Math.max(0, Math.min(1, ev.popularity)) : 0;

    // Preference match
    const prefScore = hasPrefs ? jaccard(prefs, categories) : 0;

    // Content similarity (how many attended events list this event as similar)
    const simCount = similarCounts.get(ev.id) || 0;
    const simScore = hasHistory ? Math.min(1, simCount / attended.length) : 0;

    // Geo proximity
    let distanceKm = Infinity;
    if (hasGeo && hasValidLocation(ev.location)) {
      distanceKm = calculateDistance(user.location, ev.location);

      // Optional hard cutoff (skip very distant events entirely)
      if (Number.isFinite(CONFIG.hardGeoCutoffKm) && distanceKm > CONFIG.hardGeoCutoffKm) {
        continue;
      }
    }
    const geoScore = active.geo ? proximityScoreFromKm(distanceKm) : 0;

    // Cold-start prior (category popularity)
    let coldScore = 0;
    if (coldStart && popByCat) {
      const priorSum = categories.reduce((s, c) => s + (popByCat.get(c) || 0), 0);
      coldScore = maxPrior > 0 ? priorSum / maxPrior : 0; // normalize to [0,1]
    }

    // Combine signals with dynamic normalization (only active weights contribute)
    let combined =
      (active.pref ? CONFIG.weights.pref * prefScore : 0) +
      (active.sim  ? CONFIG.weights.sim  * simScore  : 0) +
      (active.geo  ? CONFIG.weights.geo  * geoScore  : 0) +
      (active.pop  ? CONFIG.weights.pop  * popularity : 0) +
      (active.cold ? CONFIG.weights.cold * coldScore : 0);

    combined /= weightSum; // normalize to ~[0,1]

    const node = {
      score: combined,
      distance: Number.isFinite(distanceKm) ? distanceKm : Infinity,
      popularity,
      id: ev.id,
      event: ev,
      // Keep per-event pieces if we want to use them in diversity re-rank (uses score only).
    };

    if (heap.length < k) {
      heapPush(heap, node);
    } else {
      // If better than current worst (root), replace root
      const root = heap[0];
      if (betterThan(node, root)) heapReplaceRoot(heap, node);
    }
  }

  if (heap.length === 0) return [];

  // Extract nodes and sort by final ranking criteria (score desc, near first, popular first)
  const nodes = heap.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
    return a.id.localeCompare(b.id);
  });

  // Optional: gentle diversity re-rank within the selected k
  let diversified = nodes;
  if (CONFIG.diversity.enabled && nodes.length > 1) {
    diversified = rerankWithCategoryDiversity(nodes, CONFIG.diversity.alpha, CONFIG.diversity.perCategoryCap);
  }

  // Return original event objects in the final order
  return diversified.map(n => n.event);
}

/**
 * Re-rank a small candidate set to improve category diversity.
 * Greedy MMR-style: at each step, select the item with the best (score - alpha * repeatPenalty)
 * where repeatPenalty grows with how often a category has already been selected.
 * A soft cap biases selection away from categories already chosen cap times.
 *
 * @param {Array<{event:Object, score:number}>} nodes
 * @param {number} alpha - diversity strength (0=off)
 * @param {number} perCategoryCap - soft cap for repeats (Infinity to disable)
 * @returns {Array} re-ordered nodes (same length as input)
 */
function rerankWithCategoryDiversity(nodes, alpha = 0.08, perCategoryCap = 3) {
  // Pre-extract categories and base scores
  const N = nodes.length;
  const used = new Array(N).fill(false);
  const out = [];
  const catCounts = new Map();

  // Helper to compute penalty for an event given current counts
  function penaltyFor(ev) {
    const cats = Array.isArray(ev.categories) ? ev.categories : [];
    if (cats.length === 0) return 0;
    const maxCount = cats.reduce((m, c) => Math.max(m, catCounts.get(c) || 0), 0);

    // Soft cap penalty: if already reached perCategoryCap for any category, add an extra nudge
    const capPenalty = (Number.isFinite(perCategoryCap) && maxCount >= perCategoryCap) ? 0.5 : 0;

    return alpha * maxCount + capPenalty;
  }

  for (let step = 0; step < N; step++) {
    let bestIdx = -1;
    let bestVal = -Infinity;

    for (let i = 0; i < N; i++) {
      if (used[i]) continue;
      const node = nodes[i];
      const base = node.score; // in [0,1] approximately
      const pen = penaltyFor(node.event);
      const val = base - pen;

      // If tie, fall back to original ordering (which already considered distance/popularity/id)
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }

    used[bestIdx] = true;
    const chosen = nodes[bestIdx];
    out.push(chosen);

    // Update category counts
    const cats = Array.isArray(chosen.event.categories) ? chosen.event.categories : [];
    for (const c of cats) catCounts.set(c, (catCounts.get(c) || 0) + 1);
  }

  return out;
}

module.exports = {
  calculateDistance,
  getRecommendedEvents,
};

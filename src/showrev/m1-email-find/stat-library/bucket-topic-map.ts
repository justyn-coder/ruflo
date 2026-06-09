/**
 * Bucket -> Topic mapping (Phase B spec v1.1 §5).
 *
 * The 6 P.S. composition buckets in `influence.ts` map exhaustively to 6
 * stat-library topics. This is a COMPILE-TIME exhaustive switch — the
 * TypeScript `never` check on the default branch makes it a load-bearing
 * type-system guarantee that adding a new bucket without mapping it will
 * NOT compile.
 *
 * Why a separate file:
 * - Composer files (`specific-composer.ts`, `generalized-composer.ts`) and
 *   `run-pipeline-v2.ts` integration code can import the map without
 *   pulling in the full library + sidecar load (keeps cold-start cheap).
 * - Spec §5 explicitly calls out this file location.
 *
 * Why these 6 buckets and not the PSVariantKey names:
 * - PSVariantKey is a rendering concern (which P.S. template to paste).
 * - Bucket is a SEMANTIC concern (which industry topic should the stat
 *   evidence?). One bucket can later route multiple PS variants without
 *   re-shaping the library.
 *
 * Mapping rationale (spec §5 + influence.ts lines 177/186/195/204/213/222):
 * - quiet_diagnostic      -> diagnostic     (curiosity-gap diagnostic CTA)
 * - industry_data_hook    -> permit         (FBA permit-cycle stats)
 * - loss_frame_anchor     -> ops-cost       (loss framing on slipped BEAD economics)
 * - question_no_link      -> gis-cad        (GIS-to-CAD reply-hook)
 * - named_peer            -> peer-pattern   (peer-operator pattern reference)
 * - walkthrough_high_commit -> capacity     (design-capacity walkthrough)
 *
 * The PSVariantKey -> Bucket adapter lives at the composer boundary (it
 * is the composer's job to know the rendering layer); this file only
 * exposes Bucket -> TopicTag.
 */

import type { TopicTag } from './index.js';

/**
 * The 6 P.S. composition buckets. Adding a new value here without
 * updating BUCKET_TO_TOPIC will produce a TS error at the switch default.
 */
export type Bucket =
  | 'diagnostic'
  | 'permit'
  | 'gis-cad'
  | 'peer-pattern'
  | 'capacity'
  | 'ops-cost';

/**
 * Map from semantic bucket to controlled-vocab topic tag.
 *
 * Implemented as a Record<Bucket, TopicTag> (compile-time exhaustive)
 * AND backed by a switch with a `never` default check for runtime safety
 * against `as Bucket` casts at the integration boundary.
 */
const BUCKET_TO_TOPIC: Record<Bucket, TopicTag> = {
  diagnostic: 'diagnostic',
  permit: 'permit',
  'gis-cad': 'gis-cad',
  'peer-pattern': 'peer-pattern',
  capacity: 'capacity',
  'ops-cost': 'ops-cost',
};

/**
 * Resolve a Bucket to its TopicTag with an exhaustive `never` check.
 *
 * Why both record + switch: the Record gives O(1) lookup at runtime; the
 * switch's `never` default is the compile-time forcing function that the
 * spec §5 requires. If a future engineer adds a Bucket variant and forgets
 * to map it, `bucket: never` will fail the type check.
 */
export function bucketToTopic(bucket: Bucket): TopicTag {
  switch (bucket) {
    case 'diagnostic':
    case 'permit':
    case 'gis-cad':
    case 'peer-pattern':
    case 'capacity':
    case 'ops-cost':
      return BUCKET_TO_TOPIC[bucket];
    default: {
      // Exhaustiveness check: if a new Bucket variant is added, TS will
      // fail because `bucket` is no longer `never`.
      const _exhaustive: never = bucket;
      throw new Error(`Unmapped bucket: ${String(_exhaustive)}`);
    }
  }
}

/** Frozen view for callers that need the raw map (e.g., tests, telemetry). */
export const BUCKET_TO_TOPIC_FROZEN: Readonly<Record<Bucket, TopicTag>> =
  Object.freeze({ ...BUCKET_TO_TOPIC });

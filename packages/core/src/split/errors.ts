/** Why a split could not be planned. The UI maps each kind to a translated message. */
export type RangeProblem =
  | { readonly kind: 'empty' }
  | { readonly kind: 'syntax'; readonly token: string }
  | { readonly kind: 'zero'; readonly token: string }
  | { readonly kind: 'reversed'; readonly token: string }
  | { readonly kind: 'outOfRange'; readonly token: string; readonly pageCount: number };

export type SplitError =
  | { readonly kind: 'noPages' }
  | { readonly kind: 'invalidCount' }
  | { readonly kind: 'invalidLimit' }
  | { readonly kind: 'ranges'; readonly problem: RangeProblem }
  /** One page alone is larger than the limit, so no split can satisfy it. */
  | {
      readonly kind: 'pageTooLarge';
      /** 1-based position in the document. */
      readonly pageNumber: number;
      readonly size: number;
      readonly limit: number;
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'measureFailed'; readonly detail: string };

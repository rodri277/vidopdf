import type { ResolvedBookmark } from '../bookmarks/tree';
import type { MetadataSettings } from '../document/metadata';
import type { FormMode, FormValues } from '../forms';
import type { Stamp } from '../stamps/stamp';

/**
 * What is done to the document while it is assembled, because it needs the document before it is
 * saved: stamps, metadata, bookmarks and form values.
 */
export interface Decorations {
  readonly stamps: readonly Stamp[];
  /** Name of the output, for `{file}` in a stamp. */
  readonly fileName: string;
  /** The day of export, for `{date}`. */
  readonly date: string;
  readonly metadata: MetadataSettings;
  /** Resolved against the pages of this output. */
  readonly bookmarks: readonly ResolvedBookmark[];
  readonly forms: FormValues;
  readonly formMode: FormMode;
}

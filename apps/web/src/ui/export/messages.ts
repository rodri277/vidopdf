import type { TFunction } from 'i18next';
import type { RangeProblem, SplitError } from '@vidopdf/core';
import type { JobFailure, JobKind } from '../../state/session-store';
import { formatBytes } from '../format';

function rangeMessage(t: TFunction, problem: RangeProblem): string {
  switch (problem.kind) {
    case 'empty':
      return t('export.errors.rangeEmpty');
    case 'syntax':
      return t('export.errors.rangeSyntax', { token: problem.token });
    case 'zero':
      return t('export.errors.rangeZero', { token: problem.token });
    case 'reversed':
      return t('export.errors.rangeReversed', { token: problem.token });
    case 'outOfRange':
      return t('export.errors.rangeOutOfRange', {
        token: problem.token,
        pageCount: problem.pageCount,
      });
  }
}

/** What went wrong with a split, in the user's language and with the numbers that matter. */
export function splitErrorMessage(t: TFunction, error: SplitError): string {
  switch (error.kind) {
    case 'ranges':
      return rangeMessage(t, error.problem);
    case 'noPages':
      return t('export.errors.noPages');
    case 'invalidCount':
      return t('export.errors.invalidCount');
    case 'invalidLimit':
      return t('export.errors.invalidLimit');
    case 'pageTooLarge':
      return t('export.errors.pageTooLarge', {
        pageNumber: error.pageNumber,
        size: formatBytes(error.size),
        limit: formatBytes(error.limit),
      });
    case 'cancelled':
      return t('export.errors.cancelled');
    case 'measureFailed':
      return t('export.errors.measureFailed');
  }
}

/** Why a job produced nothing. The technical detail, when there is one, is kept apart for bug reports. */
export function failureMessage(
  t: TFunction,
  failure: JobFailure,
  job?: JobKind,
): { text: string; detail: string | undefined } {
  if (failure.kind === 'split')
    return { text: splitErrorMessage(t, failure.error), detail: undefined };
  if (failure.kind === 'unsupported') {
    // Pictures out fail when the browser cannot write a format; for a PDF it is a text or a
    // picture the user added that could not be written.
    return {
      text: t(
        job === undefined || job === 'images' ? 'export.failedUnsupported' : 'export.failedContent',
      ),
      detail: failure.detail,
    };
  }
  return { text: t('export.failed'), detail: failure.detail };
}

/** How a list of page numbers reads: "3, 5-7, 10". */
export function describePages(pages: readonly number[]): string {
  const parts: string[] = [];
  for (let index = 0; index < pages.length;) {
    let end = index;
    while (pages[end + 1] === (pages[end] ?? 0) + 1) end++;
    const from = pages[index] ?? 0;
    const to = pages[end] ?? 0;
    parts.push(from === to ? String(from) : `${String(from)}-${String(to)}`);
    index = end + 1;
  }
  return parts.join(', ');
}
